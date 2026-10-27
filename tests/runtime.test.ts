import { env } from "cloudflare:workers";
import {
  SELF as platformSelf,
  evictDurableObject,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { getAgentByName } from "agents";
import { emptyState, LIMITS, type BriefState } from "../src/domain";
import type { Env } from "../src/server";

const origin = "https://brief.example";
const output = {
  response: {
    reply: "Let’s define a small first step.",
    proposals: [
      {
        title: "Define the API contract",
        criteria: "A valid request returns the documented response.",
      },
    ],
  },
};
const input = {
  id: "00000000-0000-4000-8000-000000000001",
  message: "Build an API",
};

// Each test creates fresh capability-named objects; no test shares session state.
afterEach(() => {
  vi.restoreAllMocks();
});

async function request(url: string, init?: RequestInit): Promise<Response> {
  const response = await platformSelf.fetch(url, init);
  return new Response(await response.arrayBuffer(), response);
}

async function session() {
  const response = await request(`${origin}/api/state`);
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!;
  await response.arrayBuffer();
  const key = cookie.split(";")[0];
  const name = key.split("=")[1];
  const stub = await getAgentByName(env.BriefAgent, name);
  return { cookie, key, stub };
}

async function post(
  path: string,
  cookie: string,
  body: unknown,
  requestOrigin = origin,
) {
  const response = await request(`${origin}${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: requestOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return new Response(await response.arrayBuffer(), response);
}

async function mockAI(
  stub: Awaited<ReturnType<typeof session>>["stub"],
  run = vi.fn().mockResolvedValue(output),
) {
  await runInDurableObject(stub, (instance) => {
    const runtime = instance as unknown as { env: Env };
    vi.spyOn(runtime.env.AI, "run").mockImplementation(run);
  });
  return run;
}

it("persists a complete chat and explicit approval across actual object eviction", async () => {
  const { key, cookie, stub } = await session();
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Strict");
  expect(cookie).toContain("Secure");
  const run = await mockAI(stub);
  const response = await post("/api/chat", key, input);
  expect(response.status).toBe(200);
  const state = await response.json<BriefState>();
  expect(state.turns).toHaveLength(1);
  expect(state.tasks[0].status).toBe("pending");
  expect((await post("/api/chat", key, input)).status).toBe(200);
  expect(run).toHaveBeenCalledTimes(1);
  expect(
    (await post("/api/chat", key, { ...input, message: "Changed" })).status,
  ).toBe(409);
  const accepted = await post("/api/decision", key, {
    id: state.tasks[0].id,
    action: "accepted",
  });
  expect(accepted.status).toBe(200);
  await evictDurableObject(stub);
  const restored = await request(`${origin}/api/state`, {
    headers: { Cookie: key },
  });
  const saved = await restored.json<BriefState>();
  expect(saved.tasks[0].status).toBe("accepted");
  expect(saved.turns).toHaveLength(1);
  expect(saved.revision).toBe(2);
});

it("isolates sessions and blocks origin forgery and generic Agent access", async () => {
  const first = await session();
  const second = await session();
  expect(first.key).not.toBe(second.key);
  await mockAI(first.stub);
  await post("/api/chat", first.key, input);
  const other = await request(`${origin}/api/state`, {
    headers: { Cookie: second.key },
  });
  expect(await other.json()).toEqual(emptyState());
  expect(
    (await post("/api/chat", first.key, input, "https://attacker.example"))
      .status,
  ).toBe(403);
  expect((await post("/api/chat", "", input)).status).toBe(401);
  expect((await request(`${origin}/agents/brief-agent/anything`)).status).toBe(
    404,
  );
  expect(
    (
      await post("/api/decision", second.key, {
        id: `${input.id}:0`,
        action: "accepted",
      })
    ).status,
  ).toBe(404);
});

it("refuses invalid input, oversized bodies and provider failures without modifying state", async () => {
  const { key, stub } = await session();
  const run = await mockAI(
    stub,
    vi.fn().mockRejectedValue(new Error("SECRET")),
  );
  expect(
    (await post("/api/chat", key, { ...input, message: " " })).status,
  ).toBe(400);
  expect(
    (
      await post("/api/chat", key, {
        ...input,
        message: "x".repeat(LIMITS.bodyBytes),
      })
    ).status,
  ).toBe(413);
  expect(run).not.toHaveBeenCalled();
  const failed = await post("/api/chat", key, input);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("SECRET");
  run.mockResolvedValue({
    response: {
      ...output.response,
      proposals: [{ ...output.response.proposals[0], status: "accepted" }],
    },
  });
  expect((await post("/api/chat", key, input)).status).toBe(502);
  expect(
    await (
      await request(`${origin}/api/state`, { headers: { Cookie: key } })
    ).json(),
  ).toEqual(emptyState());
  run.mockResolvedValue(output);
  expect((await post("/api/chat", key, input)).status).toBe(200);
});

it("rejects concurrent writes while permitting reads during inference", async () => {
  const { key, stub } = await session();
  let release!: (value: typeof output) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<typeof output>((resolve) => {
    release = resolve;
  });
  await mockAI(
    stub,
    vi.fn().mockImplementation(() => {
      entered();
      return pending;
    }),
  );
  const first = post("/api/chat", key, input);
  await started;
  expect(
    (
      await post("/api/chat", key, {
        ...input,
        id: "00000000-0000-4000-8000-000000000002",
      })
    ).status,
  ).toBe(409);
  const read = await request(`${origin}/api/state`, {
    headers: { Cookie: key },
  });
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual(emptyState());
  release(output);
  expect((await first).status).toBe(200);
});

it("rotates to a new session explicitly and refuses malformed content", async () => {
  const { key } = await session();
  const next = await post("/api/session", key, {});
  expect(next.headers.get("set-cookie")?.split(";")[0]).not.toBe(key);
  expect(await next.json()).toEqual(emptyState());
  const invalid = await request(`${origin}/api/chat`, {
    method: "POST",
    headers: {
      Cookie: key,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: "{",
  });
  expect(invalid.status).toBe(400);
  const text = await request(`${origin}/api/chat`, {
    method: "POST",
    headers: { Cookie: key, Origin: origin },
    body: "hello",
  });
  expect(text.status).toBe(415);
});
