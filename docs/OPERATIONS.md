# Operations

## Configuration and deployment

Production entrypoint: `src/server.ts`. Required bindings: `AI`, `BriefAgent`,
and `ASSETS`. `wrangler.jsonc` registers the SQLite Durable Object class through
the immutable `v1` migration. Do not rename the class or rewrite the migration
after deployment. Add a new migration and explicitly test persisted-state
upgrades when the storage contract changes.

The fixture entrypoint is strictly for local UI tests. Never deploy
`wrangler.fixture.jsonc` as the real application. Production contains no switch
to silently substitute a sample response for failed inference.

## Failure behavior

| Code                                            | Meaning and response                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `INVALID_INPUT`, `INVALID_JSON`, `CONTENT_TYPE` | Fix request shape or text; state is unchanged                         |
| `BODY_TOO_LARGE`                                | Request exceeds the bounded JSON transport envelope                   |
| `SESSION_REQUIRED`                              | Refresh the page to obtain a session                                  |
| `ORIGIN_DENIED`                                 | A mutation came from a different/missing origin                       |
| `BUSY`                                          | Wait for the current mutation and retry                               |
| `ID_CONFLICT`                                   | Use a fresh request ID for different content                          |
| `DECISION_CONFLICT`                             | Refresh to see the current task decision                              |
| `CONTEXT_FULL`, `SESSION_FULL`                  | Export and begin a new brief                                          |
| `MODEL_INVALID`                                 | Malformed, oversized, or incomplete model output; retry               |
| `MODEL_TIMEOUT`, `MODEL_UNAVAILABLE`            | Model dependency failed; retry after recovery                         |
| `INTERNAL_ERROR`                                | Inspect infrastructure health without logging session/prompt contents |

The client retains the draft and request ID on failure. A lost HTTP response can
be retried without creating a second committed turn. The 45-second inference
deadline bounds response waiting; it does not guarantee the upstream model
stops computing or billing. There is no automatic model retry loop.

## State, privacy and recovery

State is per capability cookie, not per authenticated account. Cookies last
30 days; durable state has no automatic retention deletion in this exercise.
The app does not provide account recovery or cross-device synchronization.
Starting a new brief rotates access and does not erase the previous record.
Do not enter confidential customer material into a shared exercise deployment.

For the local app, restarting Wrangler preserves `.wrangler/state`. Removing
that directory deletes local data; only do so deliberately after export.
The integration suite explicitly evicts and restores a Durable Object to check
durability. Runtime tests allocate fresh session objects rather than clearing
shared live object storage while request callbacks are still being finalized.

For a hosted deployment, use Cloudflare's Worker rollback/version controls to
return to a known-good code version. Rollback does not undo Durable Object data
changes. Schema-breaking releases need a separately reviewed migration and
recovery plan. Preserve the `v1` migration and the state version contract.

Before a public demo, configure Access or edge rate limiting and review account
usage limits. No application-level account login, global spending limiter,
automatic data retention, or operational SLO is claimed.
