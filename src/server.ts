import { Agent, getAgentByName } from "agents";
import {
  AppError,
  LIMITS,
  completeTurn,
  decideTask,
  decisionInput,
  emptyState,
  isReplay,
  parseInput,
  turnInput,
  type BriefState,
} from "./domain";
import { generateReply } from "./model";

export interface Env {
  AI: Ai;
  BriefAgent: DurableObjectNamespace<BriefAgent>;
  ASSETS: Fetcher;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failure(error: unknown): Response {
  const safe =
    error instanceof AppError
      ? error
      : new AppError(
          "INTERNAL_ERROR",
          "The request could not be completed. Refresh and try again.",
          500,
        );
  return json(
    { error: { code: safe.code, message: safe.message } },
    safe.status,
  );
}

export async function readBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    throw new AppError("CONTENT_TYPE", "Send application/json.", 415);
  }
  if (!request.body)
    throw new AppError("INVALID_JSON", "A JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMITS.bodyBytes) {
        await reader.cancel();
        throw new AppError(
          "BODY_TOO_LARGE",
          "The request exceeds 12 KiB.",
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_JSON", "The request is not valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
}

export class BriefAgent extends Agent<Env, BriefState> {
  initialState = emptyState();
  private mutating = false;

  async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/state" && request.method === "GET")
      return json(this.state);
    if (
      request.method !== "POST" ||
      !["/api/chat", "/api/decision"].includes(path)
    )
      return json(
        { error: { code: "NOT_FOUND", message: "Unknown endpoint." } },
        404,
      );
    if (this.mutating)
      return failure(
        new AppError(
          "BUSY",
          "Another change is still running. Wait for it to finish, then retry.",
          409,
        ),
      );
    this.mutating = true;
    try {
      const body = await readBody(request);
      if (path === "/api/chat") {
        const input = parseInput(turnInput, body);
        if (!isReplay(this.state, input)) {
          const output = await generateReply(
            this.env.AI,
            this.state,
            input.message,
          );
          this.setState(completeTurn(this.state, input, output));
        }
      } else {
        const next = decideTask(this.state, parseInput(decisionInput, body));
        if (next !== this.state) this.setState(next);
      }
      return json(this.state);
    } catch (error) {
      return failure(error);
    } finally {
      this.mutating = false;
    }
  }
}

export function sessionFrom(request: Request): string | undefined {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("brief_session="))
    ?.slice("brief_session=".length);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

function createSession(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname.startsWith("/agents/"))
        return json(
          { error: { code: "NOT_FOUND", message: "Unknown endpoint." } },
          404,
        );
      return env.ASSETS.fetch(request);
    }
    try {
      const allowed =
        (request.method === "GET" && url.pathname === "/api/state") ||
        (request.method === "POST" &&
          ["/api/chat", "/api/decision", "/api/session"].includes(
            url.pathname,
          ));
      if (!allowed) throw new AppError("NOT_FOUND", "Unknown endpoint.", 404);
      if (
        request.method !== "GET" &&
        request.headers.get("origin") !== url.origin
      ) {
        throw new AppError(
          "ORIGIN_DENIED",
          "Use the application from the same origin.",
          403,
        );
      }
      let session = sessionFrom(request);
      const fresh = !session || url.pathname === "/api/session";
      if (
        !session &&
        request.method === "POST" &&
        url.pathname !== "/api/session"
      ) {
        throw new AppError(
          "SESSION_REQUIRED",
          "Refresh to start a session before sending a message.",
          401,
        );
      }
      if (fresh) session = createSession();
      if (!session)
        throw new AppError("SESSION_REQUIRED", "A session is required.", 401);
      const agent = await getAgentByName(env.BriefAgent, session);
      const forwarded =
        url.pathname === "/api/session"
          ? new Request(new URL("/api/state", url), { method: "GET" })
          : request;
      const upstream = await agent.fetch(forwarded);
      const response = new Response(upstream.body, upstream);
      response.headers.set("Cache-Control", "no-store");
      if (fresh)
        response.headers.set(
          "Set-Cookie",
          `brief_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`,
        );
      return response;
    } catch (error) {
      return failure(error);
    }
  },
} satisfies ExportedHandler<Env>;
