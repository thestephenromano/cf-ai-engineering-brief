# Contributing

Engineering Brief is a Cloudflare coding exercise. The engineering contract is
[AGENTS.md](AGENTS.md); this page covers setup and review only. It is specialized
from the `ai-program` contribution template.

Use Node 24.19.0, then run:

```sh
npm ci
git config core.hooksPath .githooks
npm run check
npm run test:gates
npm run build:client
npm test
npm run build
npm exec playwright install chromium
npm run test:browser
npm run audit
```

The local hook checks formatting and linting. CI additionally checks TypeScript,
the evidence inventory, gate tests, runtime behavior, production builds, browser
flows and dependency advisories. The browser suite uses a test-only model and
does not require Cloudflare credentials.

Use a focused conventional-commit branch, open a pull request, describe the
behavior and its validation, and resolve review discussions. Protect `main`
with the three CI jobs as required checks. Report security concerns privately
to the repository owner; do not put session tokens or private prompts in issues.
