# Validation results

Executed locally on 2026-10-27 on macOS arm64. Application scripts used the
pinned Node 24.19.0 toolchain. A fresh `npm ci` completed successfully before the
final verification run. The shell's installer used Node 26 and printed an
engine warning; npm scripts resolve the pinned Node 24 binary. GitHub CI selects
Node 24 directly from `.node-version`.

| Check                                  | Observed result                                         |
| -------------------------------------- | ------------------------------------------------------- |
| Clean lockfile install                 | Passed; 245 packages installed, 246 audited             |
| Formatting, ESLint and TypeScript      | Passed; no lint warnings or type errors                 |
| Local evidence/workflow inventory      | Passed                                                  |
| Gate-validator tests                   | 6 passed, no skips                                      |
| Workers runtime and domain/model tests | 21 passed, no skips                                     |
| Desktop/mobile browser tests           | 4 passed, no skips                                      |
| Vite production build                  | Passed; browser JS 310.61 kB, 94.82 kB gzip             |
| Wrangler deployment dry run            | Passed; Worker 2281.98 KiB, 422.46 KiB gzip             |
| Dependency advisory audit              | 0 vulnerabilities at execution time                     |
| GitHub workflow syntax                 | Passed actionlint 1.7.12 with verified archive checksum |

Commands: `npm ci`, `npm run verify`, `npm run lint:ci`.

The behavioral suite covers explicit approval, all task transition combinations,
duplicate-request idempotency, deterministic domain replay (200 seeded property
cases), malformed model output, context limits, model deadlines, safe provider
errors, session isolation, origin enforcement, body bounds, concurrent writes,
and actual Durable Object eviction followed by recovery. Browser tests exercise
the production frontend against the test-only model entrypoint, including
network failure and reuse of the original request ID.

Screenshots were visually inspected at desktop and mobile widths. There were no
browser page errors or horizontal overflow in the tested layouts. The screenshot
in the README shows the empty local app; model responses in browser tests are
synthetic and are not evidence of live inference quality.

## Not executed or claimed

- Live Workers AI inference and hosted deployment: `wrangler whoami` reported
  no authenticated account. No Cloudflare resources were created.
- Branch protection and production Environment reviewer policy are not
  established by local checks. Hosted CI results are recorded in the repository
  [Actions history](https://github.com/thestephenromano/cf-ai-engineering-brief/actions).
- Formal proofs, mutation adequacy, coverage floor, calibrated performance SLO,
  and reproducible released artifacts: no such assurance claims are made.
- The canonical Assay sweep was invoked with `--no-api --format json`; it
  returned no level because this new repository has no committed remote revision.
  That is an unavailable measurement, not a passed conformance check.

The initial import is delivered through `feature/engineering-brief` into the
public GitHub repository. This table records the local checks before that import;
GitHub Actions records subsequent hosted checks against exact commit identities.
No Cloudflare deployment was performed. Existing repositories, including
`ai-program`, were not changed.
