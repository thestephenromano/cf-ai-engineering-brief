import { z } from "zod";

export const LIMITS = {
  turns: 24,
  message: 1500,
  reply: 2000,
  proposals: 3,
  title: 100,
  criteria: 400,
  bodyBytes: 12 * 1024,
  contextBytes: 18_000,
  modelMs: 45_000,
} as const;

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const text = (max: number) => z.string().trim().min(1).max(max);
export const turnInput = z.strictObject({
  id: z.uuid(),
  message: text(LIMITS.message),
});
export const decisionInput = z.strictObject({
  id: z.string().min(1).max(40),
  action: z.enum(["accepted", "dismissed", "done"]),
});
export const modelOutput = z.strictObject({
  reply: text(LIMITS.reply),
  proposals: z
    .array(
      z.strictObject({
        title: text(LIMITS.title),
        criteria: text(LIMITS.criteria),
      }),
    )
    .max(LIMITS.proposals),
});

export type TurnInput = z.infer<typeof turnInput>;
export type ModelOutput = z.infer<typeof modelOutput>;
export type Decision = z.infer<typeof decisionInput>;
export type Task = ModelOutput["proposals"][number] & {
  id: string;
  status: "pending" | Decision["action"];
};
export interface BriefState {
  version: 1;
  revision: number;
  turns: Array<TurnInput & { reply: string }>;
  tasks: Task[];
}

export function emptyState(): BriefState {
  return { version: 1, revision: 0, turns: [], tasks: [] };
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      "INVALID_INPUT",
      "Check the request fields and text length.",
    );
  return result.data;
}

/** Returns true only when the exact turn has already committed. */
export function isReplay(state: BriefState, input: TurnInput): boolean {
  const previous = state.turns.find((turn) => turn.id === input.id);
  if (previous && previous.message !== input.message) {
    throw new AppError(
      "ID_CONFLICT",
      "This request ID belongs to a different message.",
      409,
    );
  }
  if (previous) return true;
  if (state.turns.length >= LIMITS.turns) {
    throw new AppError(
      "SESSION_FULL",
      "This brief has reached 24 turns. Export it and start a new brief.",
      409,
    );
  }
  return false;
}

export function completeTurn(
  state: BriefState,
  input: TurnInput,
  output: ModelOutput,
): BriefState {
  if (isReplay(state, input)) return state;
  return {
    ...state,
    revision: state.revision + 1,
    turns: [...state.turns, { ...input, reply: output.reply }],
    tasks: [
      ...state.tasks,
      ...output.proposals.map((proposal, index): Task => ({
        title: proposal.title,
        criteria: proposal.criteria,
        id: `${input.id}:${index}`,
        status: "pending",
      })),
    ],
  };
}

export function decideTask(state: BriefState, decision: Decision): BriefState {
  const task = state.tasks.find((item) => item.id === decision.id);
  if (!task)
    throw new AppError(
      "TASK_NOT_FOUND",
      "That task does not exist in this brief.",
      404,
    );
  if (task.status === decision.action) return state;
  const allowed =
    (task.status === "pending" &&
      (decision.action === "accepted" || decision.action === "dismissed")) ||
    (task.status === "accepted" && decision.action === "done");
  if (!allowed)
    throw new AppError(
      "DECISION_CONFLICT",
      "This task has already moved to a different status. Refresh the brief.",
      409,
    );
  return {
    ...state,
    revision: state.revision + 1,
    tasks: state.tasks.map((item) =>
      item.id === decision.id ? { ...item, status: decision.action } : item,
    ),
  };
}

export function exportBrief(state: BriefState): string {
  const tasks = state.tasks.filter(
    (task) => task.status === "accepted" || task.status === "done",
  );
  return [
    "# Engineering brief",
    "",
    "## Accepted plan",
    "",
    ...(tasks.length
      ? tasks.map(
          (task) =>
            `- [${task.status === "done" ? "x" : " "}] ${task.title}\n  Acceptance: ${task.criteria}`,
        )
      : ["No tasks accepted yet."]),
    "",
    "## Conversation",
    "",
    ...state.turns.flatMap((turn) => [
      `You: ${turn.message}`,
      "",
      `Assistant: ${turn.reply}`,
      "",
    ]),
  ].join("\n");
}
