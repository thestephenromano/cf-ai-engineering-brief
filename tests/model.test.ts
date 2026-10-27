import { expect, it, vi } from "vitest";
import { emptyState, LIMITS } from "../src/domain";
import {
  decodeModel,
  generateReply,
  modelMessages,
  withinDeadline,
} from "../src/model";

it("accepts object and string JSON envelopes, refusing malformed or injected output", () => {
  const data = { reply: "What is the primary use case?", proposals: [] };
  expect(decodeModel({ response: data })).toEqual(data);
  expect(decodeModel({ response: JSON.stringify(data) })).toEqual(data);
  for (const value of [
    null,
    {},
    { response: "```json" },
    { response: { ...data, approval: true } },
    { response: { ...data, reply: "" } },
  ]) {
    expect(() => decodeModel(value)).toThrow(
      expect.objectContaining({ code: "MODEL_INVALID" }),
    );
  }
});

it("includes prior conversation and decisions; never silently truncates", () => {
  const state = emptyState();
  state.turns.push({
    id: "old",
    message: "A tiny service",
    reply: "Define its scope.",
  });
  state.tasks.push({
    id: "old:0",
    title: "Limit scope",
    criteria: "One route",
    status: "accepted",
  });
  const messages = modelMessages(state, "Use TypeScript");
  expect(messages.some((item) => item.content === "A tiny service")).toBe(true);
  expect(
    messages.some((item) => item.content.includes('"status":"accepted"')),
  ).toBe(true);
  expect(messages.at(-1)?.content).toBe("Use TypeScript");
  state.turns[0].message = "🙂".repeat(LIMITS.contextBytes);
  expect(() => modelMessages(state, "Next")).toThrow(
    expect.objectContaining({ code: "CONTEXT_FULL" }),
  );
});

it("times out stalled inference and clears timers after successful work", async () => {
  vi.useFakeTimers();
  const result = withinDeadline(new Promise<never>(() => {}), 50);
  const rejection = expect(result).rejects.toMatchObject({
    code: "MODEL_TIMEOUT",
    status: 504,
  });
  await vi.advanceTimersByTimeAsync(50);
  await rejection;
  expect(await withinDeadline(Promise.resolve("ready"), 50)).toBe("ready");
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("sanitizes provider errors and refuses context before invoking the model", async () => {
  const run = vi.fn().mockRejectedValue(new Error("secret provider payload"));
  const ai = { run } as unknown as Ai;
  await expect(generateReply(ai, emptyState(), "Hi")).rejects.toMatchObject({
    code: "MODEL_UNAVAILABLE",
    status: 503,
  });
  const state = emptyState();
  state.turns.push({ id: "one", message: "x".repeat(20_000), reply: "Hello" });
  await expect(generateReply(ai, state, "Next")).rejects.toMatchObject({
    code: "CONTEXT_FULL",
  });
  expect(run).toHaveBeenCalledTimes(1);
});
