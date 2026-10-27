# Architecture

The browser uses same-origin HTTP. A Worker issues a random 256-bit HttpOnly,
SameSite=Strict capability cookie and routes only its session to BriefAgent using
getAgentByName. The public API has no caller-selected Agent ID and does not expose
the generic Agents WebSocket/RPC route. Origin checks protect mutations.

BriefAgent extends Cloudflare Agent, whose SQLite-backed setState persists the
whole bounded session. A mutation guard is acquired before reading request
bodies or awaiting inference. Reads remain available while inference runs.
Workers AI Llama 3.3 emits structured JSON; Zod validates it before a pure domain
transition assigns proposal IDs and pending status. A single synchronous state
replacement commits the completed turn. Model advice never invokes approval.

The frontend shows the discussion, pending proposals and accepted plan. React
escapes text; model content never becomes HTML. Browser refresh restores state.
The session cookie is Secure on HTTPS. Localhost HTTP is only for development.

Dependencies: agents (MIT) supplies durable lifecycle; zod (MIT) supplies runtime
schemas; React (MIT) supplies UI rendering. Build/test tools are pinned by the
lockfile. No AI SDK abstraction or separate database is needed. SDK code is not
copied. The package manager audit is run over the resolved dependency graph.

Deployment: one Worker, static assets, one SQLite Durable Object namespace and
one Workers AI binding. Authenticated Cloudflare access is required for live AI
locally and deployment. The exercise exposes an anonymous session, not multiuser
account management. Put a shared deployment behind Cloudflare Access or rate
limiting before opening it to untrusted traffic; per-session limits alone do not
limit an attacker creating sessions. No public deployment is performed by tests.
