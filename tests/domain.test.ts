import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  LIMITS,
  completeTurn,
  decideTask,
  emptyState,
  exportBrief,
  isReplay,
  modelOutput,
  parseInput,
  turnInput,
  type ModelOutput,
  type Task,
} from "../src/domain";

const input = {
  id: "00000000-0000-4000-8000-000000000001",
  message: "Build a webhook consumer.",
};
const output: ModelOutput = {
  reply: "Start with the delivery contract.",
  proposals: [
    {
      title: "Deduplicate events",
      criteria: "Replaying an event changes the result only once.",
    },
  ],
};

describe("approval and replay contracts", () => {
  it("makes model proposals pending and never changes earlier decisions", () => {
    const first = completeTurn(emptyState(), input, output);
    expect(first.tasks[0].status).toBe("pending");
    const accepted = decideTask(first, {
      id: first.tasks[0].id,
      action: "accepted",
    });
    const next = completeTurn(
      accepted,
      { ...input, id: "00000000-0000-4000-8000-000000000002" },
      output,
    );
    expect(next.tasks.map((task) => task.status)).toEqual([
      "accepted",
      "pending",
    ]);
    expect(first.tasks[0].status).toBe("pending");
  });

  it("replays any committed turn exactly once", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (message) => {
        const request = { ...input, message };
        const once = completeTurn(emptyState(), request, output);
        expect(completeTurn(once, request, output)).toBe(once);
        expect(once.turns).toHaveLength(1);
        expect(once.tasks).toHaveLength(1);
        expect(completeTurn(emptyState(), request, output)).toEqual(once);
      }),
      { numRuns: 200, seed: 271026 },
    );
  });

  it("rejects a duplicate ID with different content", () => {
    const state = completeTurn(emptyState(), input, output);
    expect(() =>
      isReplay(state, { ...input, message: "A different request" }),
    ).toThrow(expect.objectContaining({ code: "ID_CONFLICT" }));
  });

  it("enforces every status/action combination, including terminal retries", () => {
    const statuses: Task["status"][] = [
      "pending",
      "accepted",
      "dismissed",
      "done",
    ];
    const actions = ["accepted", "dismissed", "done"] as const;
    const allowed = new Set([
      "pending:accepted",
      "pending:dismissed",
      "accepted:done",
    ]);
    for (const status of statuses)
      for (const action of actions) {
        const state = completeTurn(emptyState(), input, output);
        state.tasks[0].status = status;
        const decision = { id: state.tasks[0].id, action };
        if (status === action) expect(decideTask(state, decision)).toBe(state);
        else if (allowed.has(`${status}:${action}`))
          expect(decideTask(state, decision).tasks[0].status).toBe(action);
        else
          expect(() => decideTask(state, decision)).toThrow(
            expect.objectContaining({ code: "DECISION_CONFLICT" }),
          );
      }
  });

  it("rejects unknown tasks without changing state", () => {
    const state = emptyState();
    expect(() =>
      decideTask(state, { id: "missing", action: "accepted" }),
    ).toThrow(expect.objectContaining({ code: "TASK_NOT_FOUND" }));
    expect(state).toEqual(emptyState());
  });

  it("caps turns without preventing a retry of the final committed turn", () => {
    let state = emptyState();
    for (let index = 0; index < LIMITS.turns; index++) {
      state = completeTurn(state, { ...input, id: String(index) }, output);
    }
    expect(isReplay(state, { ...input, id: "23" })).toBe(true);
    expect(() => isReplay(state, input)).toThrow(
      expect.objectContaining({ code: "SESSION_FULL" }),
    );
    expect(state.turns).toHaveLength(24);
  });

  it("exports accepted tasks and conversation, excluding pending and dismissed tasks", () => {
    let state = completeTurn(emptyState(), input, {
      ...output,
      proposals: [
        output.proposals[0],
        { title: "Do not include pending", criteria: "Pending" },
        { title: "Do not include dismissed", criteria: "Dismissed" },
      ],
    });
    state = decideTask(state, { id: state.tasks[0].id, action: "accepted" });
    state = decideTask(state, { id: state.tasks[0].id, action: "done" });
    state = decideTask(state, { id: state.tasks[2].id, action: "dismissed" });
    expect(exportBrief(state)).toContain("[x] Deduplicate events");
    expect(exportBrief(state)).toContain(input.message);
    expect(exportBrief(state)).not.toContain("Do not include");
    expect(exportBrief(emptyState())).toContain("No tasks accepted yet.");
  });
});

describe("untrusted schema boundaries", () => {
  it.each(["", " ", "a".repeat(LIMITS.message + 1)])(
    "rejects empty or excessive messages",
    (message) => {
      expect(() => parseInput(turnInput, { ...input, message })).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    },
  );
  it("accepts the maximum message and trims surrounding whitespace", () => {
    expect(
      parseInput(turnInput, { ...input, message: "x".repeat(LIMITS.message) })
        .message,
    ).toHaveLength(1500);
    expect(
      parseInput(turnInput, { ...input, message: "  hello  " }).message,
    ).toBe("hello");
  });
  it("rejects caller roles, model status, IDs and excess proposals", () => {
    expect(turnInput.safeParse({ ...input, role: "system" }).success).toBe(
      false,
    );
    expect(turnInput.safeParse({ ...input, id: "bad" }).success).toBe(false);
    for (const extra of [{ status: "accepted" }, { id: "chosen" }]) {
      expect(
        modelOutput.safeParse({
          ...output,
          proposals: [{ ...output.proposals[0], ...extra }],
        }).success,
      ).toBe(false);
    }
    expect(
      modelOutput.safeParse({
        ...output,
        proposals: Array(4).fill(output.proposals[0]),
      }).success,
    ).toBe(false);
    expect(
      modelOutput.safeParse({ ...output, reply: "x".repeat(LIMITS.reply + 1) })
        .success,
    ).toBe(false);
  });
});
