# Repository Guidelines


**Correctness, performance, and clean architecture are first-class features of every MorphIQ Labs project**, not qualities traded away for delivery speed or deferred to a follow-up. Each is held to evidence, and this document is how: correctness is *proven* — by the invariants, their enforcement ladder, and the assurance gates, never asserted; performance is *designed* — the complexity class, the data structure, the allocation, and any vectorization chosen deliberately at design time, then measured wherever measurement applies; architecture is *enforced* — boundaries checked mechanically, and complexity removed rather than accumulated. What each demands concretely differs by project; that all three stay top of mind does not. A change that erodes any of the three is incomplete however quickly it ships, and "it works" is not evidence for any of them.

## Purpose and Architecture

Engineering Brief is a coding exercise: a browser conversation produces proposed engineering tasks; only an explicit user decision can accept a task. The deterministic domain core owns validation and transitions; the Cloudflare Agent owns serialized orchestration and durable state; the Worker owns session isolation; React owns presentation. ESLint prohibits infrastructure imports and nondeterministic APIs in the core.

Cloudflare Agents owns SQLite persistence and object lifecycle; Workers AI owns inference. This project owns the brief contract, bounded context, session routing and review decisions. Browser → Worker → Agent → Workers AI → validated proposals → explicit review.

`docs/CONTRACT.md` is the testable behavioral contract; `docs/ARCHITECTURE.md` records structure and rationale. Read both before behavioral changes.

## Project Structure

`src/domain.ts`: pure transitions and schemas. `src/model.ts`: inference boundary. `src/server.ts`: Worker and Agent. `src/client.tsx`, `src/styles.css`: browser UI. `tests/`: behavior and runtime integration. `scripts/`: executable gates. `docs/validation/`: private local evidence; no Assay level is claimed. Read README.md, docs/CONTRACT.md and docs/ARCHITECTURE.md first.

## Build, Test, and Development Commands

Use Node 24 and npm with the committed lockfile.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

`check` runs formatting, ESLint (zero warnings), strict TypeScript and evidence validation. Tests cover domain properties and the actual Workers runtime. The local hook runs format and lint checks only. GitHub Actions adapts the shared check/test/assurance/release stage set into check, test and assurance jobs plus a manual production deployment workflow, as explicitly requested for this assignment. This exercise has a private GitHub repository; hosted runs are recorded in GitHub Actions. There is no released version. Release and forge controls are recorded as unmeasured, never claimed as adopted.

## Design Constraints

- AI output is untrusted, schema-validated, and cannot choose IDs or task status. The owning transition creates pending proposals.
- Chat and model output commit together. Failed inference leaves the last durable state intact. One mutation at a time per Agent prevents stale completion overwrites.
- Requests carry an idempotency key. A committed retry with the same text returns state; reusing the key for different text refuses.
- Persistent schema version 1 is pre-release. Future stored schema changes require forward migrations.
- Typed error codes cover external failures. Never log prompts, session cookies or model output.
- Domain transitions are deterministic; randomness belongs only to the session boundary.
- All scans are bounded by the session contract: at most 24 turns and 72 proposals. No latency claim for remote inference; a 45-second response budget fails explicitly. Full context must fit the documented budget; no silent truncation. There is no calibrated throughput baseline.
- This is a local exercise, not a new portfolio brand. Public release requires preparing a clean submission without private Assay method/evidence records.

## Compatibility, Migrations, and Operations

- Treat public APIs, wire formats, error codes, configuration, and persistent schemas as contracts. State whether a change is backward compatible and provide a rollout or migration plan for intentional breaks.
- Use forward migrations for persistent state; never rewrite a migration that may have run. Test upgrades and mixed-version behavior when rollout safety depends on them, and document recovery or rollback constraints.
- Return structured errors for external input, dependency, and operational failures; reserve panics for documented internal invariants callers cannot violate. Operational changes address structured diagnostics, readiness, shutdown, backpressure, bounded retries, and failure visibility without exposing sensitive data.

## Invariants and Trust Boundaries

Invariants live in `docs/CONTRACT.md` and `docs/ARCHITECTURE.md`; violating one is a defect even if tests pass. Every new or changed invariant names its enforcement, chosen from this ladder: (1) unrepresentable by construction (types, guards), (2) enforced inside the owning component, (3) only then a tested convention hardened by mutation gates — mutation testing proves a test bites, but cannot stop an invariant from being convention, and conventions upheld by caller discipline at multiple call sites drift. The contract also names focused unit and mutation test witnesses, plus property or integration tests where behavior crosses a boundary; tests verify enforcement but do not replace ownership by types or the component where the contract first applies. The rules below are paid-for lessons; treat them as review gates.

- **Never assert source text, byte offsets, or statement order in a test.** If ordering matters, make the wrong order unrepresentable (e.g. the dependent action is a method on the guard the prerequisite returns).
- **Test scaffolding restores what it disturbed from a copy it took, never with `git checkout -- <file>`.** Reverting a path to `HEAD` discards the contributor's uncommitted work along with the fixture's, including work the same run has just verified; a harness that mutates the tree records the prior contents first and puts those back.
- **Trust boundaries exchange verified evidence, not re-derivation.** When one layer has verified data, hand the next layer a typed, validated proof (position, digest, token) instead of having it re-scan. Adding an expensive re-verification pass to any critical path must be justified against an explicit budget.
- **Partial data is surfaced, never silently absorbed.** Truncation, a torn record, or a missing counterpart is reported out of band (result flag + log); silence lets damage masquerade as a clean result or as a downstream bug.
- **Files or records with more than one writer need an explicit concurrency story**: unique exclusive-create temp names, atomic publication, and defined merge/adoption semantics for divergence. A fixed temp path shared by writers is a latent torn-write bug.
- **Escape hatches ship complete**: any flag that bypasses an invariant lands in the same change as its durable audit trail, its remediation tooling, and its operator-doc entry. A permanent mark with no exit is an operational trap.
- **Config values are contracts**: never silently change the runtime semantics of an existing value. If semantics must change, warn loudly at startup or rename the value.
- **Limits admit worst-case legitimate data**: every size/rate cap is justified against the largest legitimate input the system can produce, not a comfortable constant.
- **Operational tooling validates before it replaces**: anything overwriting last-known-good data (backups, promoted artifacts, state files) stages, validates, then promotes atomically, so failure preserves the previous good copy. Correctness logic belongs in the primary language with integration tests; shell stays a thin wrapper.
- **Every binary handles `--help`, `--version`, and `--` before argument validation.**

## Engineering and Review Principles

- Treat technical debt as a code-review concern, and finish the job in the change that surfaces it: a fix targets the defect pattern, not the instance, so same-pattern siblings in the crate or module you are already changing must be fixed in the same change — not material for follow-on issues or MRs. Where one program is realised in more than one language or repository, that scope crosses the repository boundary: a finding in one instantiation is evidence about every other until each is checked, and fixing it only where it surfaced is the same instance-not-pattern failure one level up. Search that scope for siblings and say what the search found, including when it found none: a reviewer cannot otherwise tell an absence from an omission. Every sibling found must be fixed in the same change — never deferred to a follow-up issue, an epic's plan, or a later MR. If a sibling's fix needs its own design, that design is part of the change; if a sibling sits in code an in-flight change is rewriting, coordinate so the fix lands with that change. If completing the pattern would make one diff too large to review (an unreviewable diff is its own risk), split it into stacked merge requests that land together through an integration branch, not into a backlog.
- Root-cause every regression: how it entered, why safeguards missed it, and what test, invariant, tooling, or process change prevents recurrence.
- Fix problems at the layer where their contract is first violated; do not mask a downstream defect with an upstream workaround.
- Optimize for simplicity and maintainability; refactor when it removes complexity or restores sound boundaries.
- Documentation and design artifacts ship in the same change that invalidates them: the architecture and contract docs, operator runbook, embedded diagrams, and any dual-maintained renderings stay in sync with the system. A doc or diagram that no longer describes the current system is a defect, not deferred polish. Keep standards documents current-state only; discovery history belongs in commit messages and evidence records.

## Assurance

- Treat critical state machines and numerical/accounting logic as proof obligations: define the domain, units, preconditions, postconditions, invariants, and failure semantics before implementation; prove conservation, bounds, monotonicity, idempotency, and transition safety as applicable. Use machine-checkable specifications, model checking, SMT, or proof-assistant artifacts for critical properties, kept versioned and reproducible.
- Separate exact-model proofs from implementation evidence: validate finite-precision behavior, overflow boundaries, tolerances, and exceptional inputs independently with canonical references or independent oracles plus property, adversarial, fuzz, and mutation tests. State assumptions and error bounds explicitly. Tests support a proof-to-code argument but are not proof; never claim more assurance than the checked artifacts establish.
- Assurance requirements stay executable: pin mutation and formal-verification configuration, document local commands, run required gates in CI, and retain inspectable reports or proof artifacts. A requirement without runnable tooling is incomplete work; if initial tooling has a large blast radius, track it in a linked, scoped issue and do not overstate current assurance. A gate is adopted only once it has been executed and watched to fail for the reason it claims, because a gate that has never run is an intention; and its script runs unchanged on the contributor's machine and on the runner, since one that works only in CI stops being run by hand and one that works only by hand is not a gate.
- Gate code is production code and fails closed at its own level: a check that could not start — a missing tool, an absent report, an empty input set — is distinguishable from a check that ran and refused, in its exit status and in everything that reads it. The gate's own suite is the first consumer of that distinction, and the one that usually misses it: a case asserting *this gate rejects bad input* is satisfied by any non-zero exit, so a gate that failed to start reads as a gate that correctly said no, and the suite reports green having measured nothing.
- The pipeline definition and the gate scripts are artifacts that can be wrong, and are checked like any other: a config that does not parse yields a pipeline with zero jobs and a red cross, indistinguishable at a glance from a failing test, so it is validated before it is pushed rather than by being pushed. The scripts are linted too — they are usually the only executable code in the tree that nothing reads.


## Research References and Preservation

- Treat referenced papers and source documents as durable research assets, not ephemeral planning files. Use the shared private [MorphIQ-Labs research library](https://github.com/MorphIQ-Labs/research-library) for acquired originals and internal notes, subject to their terms. Preserve source bytes and notices; use stable document IDs and distinct records for distinct versions. Consult the library's README.md, RIGHTS.md and AGENTS.md for archive operations.
- Record the title, authors, exact version, original-source URL, actual acquisition route and date, SHA-256, byte count, consuming projects and document-specific rights status. Keep acquisition snapshots immutable and unavailable references explicit. An unreviewed permission is unresolved, not permission granted or denied; never invent provenance or silently substitute an upstream revision.
- Public repositories retain bibliography entries, original-source links, exact version identifiers and hashes, together with their own derivations, contracts, tests, reproducible fixtures and generators, and validation evidence. Public source builds and CI must work without access to the private library. Internal notes and proprietary material remain private; do not move the evidence supporting public correctness claims behind private access.
- Public availability, possession of a copy, and a related source-code license do not establish permission to redistribute a publication. Record permission evidence for the exact document and intended scope before including third-party research in a public repository, package, release or attachment. Private storage does not itself authorize team sharing: review applicable terms before expanding access. Keep publication rights separate from implementation/source-code provenance and the project's own license.
- Before removing a project's tracked research copies, preserve them in the authorized archive and verify destination bytes against the recorded hashes. Retain public provenance and update references in the same change. Removal from the current tree does not remove prior Git history, clones or archives; a history rewrite is a separate, explicitly scoped operation. Papers with documented redistribution permission may remain public when useful.

## Security, Safety, and Dependencies

- Never commit or log secrets, credentials, or sensitive payloads; configs in the repo are templates, not secret stores. Production secrets load from the environment or an approved secret store. External credentials carry the minimum permissions the system needs.
- Avoid unsafe or unchecked constructs; deny them at entry points where no audited exception exists. Introducing an exception requires prior design justification, a minimal isolated boundary, documented `SAFETY` invariants, focused tests, and explicit review.
- Add dependencies only when workspace or standard-library facilities are insufficient; document maintenance, security, licensing, compile-time, and hot-path cost, declare shared versions centrally, and keep lockfile changes intentional. Consume internal substrates by pinned release, never by moving branch.

## Coding Style and Testing

TypeScript strict mode; Prettier formatting; ESLint with zero warnings. Behavioral tests live under tests/. Boundary and property tests cover malformed input, idempotency, task approval and session isolation.

- Changes to core state-transition or event logic include deterministic replay/idempotency tests, or this project’s equivalent regression class.
- Match the surrounding code's comment density and idiom; comments state constraints code cannot, never narrate the change.

## Merge Requests and Releases

The default branch accepts no direct pushes; every change lands through a merge request with all discussions resolved. Each MR carries one reviewable concern; this is a scope and accountability rule, not a serialization rule. Multiple open or stacked MRs are allowed, and an in-flight MR is not a reason to stop in-scope work. Keep dependencies explicit and merge dependent MRs in order. Do not widen scope unasked, and discuss large architectural changes before implementing them. Completing the defect pattern an issue names is finishing the job, not widening scope; do not use another MR or issue as an escape hatch for work the current issue already requires. A finding surfaced while qualifying a change stays in its train: fix it in an MR stacked on the change that surfaced it, one concern each, and open no issue for it. Issues come from up-front planning — an audit, then an epic with ordered issues drafted for review — or when asked; findings of one defect family share one issue, condensed rather than multiplied.

Work that belongs to an epic is not piece-mealed into the default branch. When the epic starts, cut its integration branch, `integration/<epic-slug>`, from the default branch. Each piece is its own one-concern MR into that branch, reviewed and squash-merged there under the same title and description rules, and a finding surfaced while qualifying a piece is stacked into the same branch. Keep the branch current by merging the default branch into it, never by rebasing shared history. The epic reaches the default branch through one MR from its integration branch, opened when every issue in the epic is done and merged only after the owner signs off on that MR. Because the `assurance` stage runs only on merge requests targeting the default branch, that MR is where it runs over the whole epic, and it must be green before sign-off. Pieces that are individually green do not reach the default branch ahead of the epic. Work outside any epic lands on the default branch directly.

Branch and title share the conventional-commit vocabulary, because release automation reads it: branches are `<type>/<slug>` (`docs/agents-md-canonical`, `fix/torn-tail-signal`), except an epic's `integration/<epic-slug>`, and the MR title is a conventional commit (`feat:`, `fix:`, `docs:`, `chore:`, …) enforced by CI. The MR is squash-merged, so that title becomes the single commit subject on the default branch and is what the release tooling reads to compute the next version and changelog entry. An epic's MR to the default branch therefore carries the epic's conventional title, marked breaking (`!`) if any piece is.

An MR states what changed and why, its risk impact, an impact statement for the system's core property where applicable, and performance impact for hot-path changes. It **must close the issues it resolves**: put `Closes #N` (or `Closes #N, #M`) in the description so merging closes them automatically, and confirm they closed. GitLab closes issues only on merge to the default branch, so an MR into an integration branch references its issues, and the epic's MR to the default branch carries `Closes` for all of them. A resolved issue left open is incomplete work; if the change only partially addresses one, say what remains instead of closing it.

Merging to the default branch must leave the repository releasable, because releases are automated. Two models exist and the choice is not a preference:

- **Tag-release (the default here).** Two release jobs, and a repository needs both. A root `CHANGELOG.md` is part of the release contract; preparation rejects a missing one before touching manifests. After every merge to the protected default branch, `prepare-release` derives the next version from the conventional-commit subjects since the last release, bumps the workspace version, writes the changelog section, and opens or refreshes the `chore/release` merge request. The scheduled lane is recovery-only. When the release MR lands, `tag-release` cuts the tag and the GitLab release at that exact merge; preparation recognizes that merge as a no-op, so it cannot recursively propose another version. The release MR must be built on its target's tip: `check-release-current` fails it otherwise, and merge trains run that check against the target as it is when merging. A proposal merged on an older base ships commits its notes do not list (morphiq-markov v0.0.3 did, minutes after a fix), so preparation also rebuilds any proposal not built on the current tip, even when its files are unchanged. Nothing is packaged, so no dependency has to resolve on a registry. A repository shipping a public Rust API also runs `check-semver.sh` on every merge request: it validates every explicitly named released package against the last completed or pending release boundary, using the same conventional release intent that preparation will apply. Explicit package selection is mandatory because workspace selection silently skips `publish = false` crates.

  Ship the release jobs together. `tag-release` alone publishes only what something else already bumped, and its no-op is indistinguishable from success: tollgate ran that way after release-plz was removed and sat six commits past `v0.5.0`, one of them breaking, reporting `already exists; nothing to do` on every push with a green pipeline. See `templates/prepare-release.reference.sh`, `templates/tag-release.reference.sh`, `templates/check-release-current.reference.sh`, and `templates/check-semver.reference.sh`.
- **release-plz.** The merge opens or updates a `chore: release` MR carrying the version bump and `CHANGELOG.md`, and merging *that* creates the tag. It is only usable where **every managed crate is independently packageable**: `git_only` still runs `cargo package` per crate, which requires every dependency to carry a version requirement *and* resolve on crates.io. Workspaces whose managed crates depend on each other by `path`, or on unpublished crates by `git`, cannot use it — verified against morphiq-platform, spread-foundry, and ferro-wave. Release scope is an allowlist: the workspace defaults to `release = false`, and every managed package explicitly sets `release = true` and `git_only = true`. Never inherit `git_only = true` across a workspace containing private or unmanaged members; in pinned release-plz 0.3.160, Git-only historical tag discovery happens before the release filter, so neither `publish = false` nor `release = false` alone excludes such a member. Do **not** put `publish = false` in a managed package's Cargo manifest: in pinned 0.3.160 it removes the package from `release-plz release` before tags are considered, and the job exits 0 having done nothing — `git_only = true` does not rescue it at either scope. The registry guard belongs in `release-plz.toml` instead. That costs the two things the manifest key buys — refusing a stray `cargo publish`, and cargo-deny reading the crate as private so `[bans] allow-wildcard-paths` applies to path-only internal dependencies — so **a repository that needs the manifest key more than it needs release-plz uses tag-release**, which packages nothing and does not filter on it. A registry list (`publish = ["name"]`) must **not** appear in a manifest: it makes release-plz package and re-resolve path dependencies. Prove the complete flow with pinned `release-plz update` in required merge-request CI on every change, using full history and tags and the same private-source, vendoring, and Cargo preparation as the production release job; assert that unmanaged manifests remain untouched. A one-time adoption run is insufficient because later workspace-topology and dependency-source changes can invalidate historical reconstruction. Read the output: with no tag matching `git_tag_name`, packaging never runs and exit 0 proves nothing. Never hand-cut a tag or hand-edit a released changelog section. Keep release configuration aligned with the shared reference. See the reference file for the full rationale and version history. A change landing there carries its conventional title, a green assurance stage, and any manifest or version implications of what it changed.

## Repository and Branch Settings

Trunk-based, one long-lived branch. An epic's integration branch is short-lived and unprotected, and is deleted when the epic lands; protecting it would make it long-lived. The workflow above is prose until these settings enforce it, and settings drift without ever failing a build — so they are stated here and audited, not assumed. Every project carries the same configuration:

| Setting | Value | Why |
| --- | --- | --- |
| Default branch | `main` | There is no `develop` and no release train. A second long-lived branch also silently disables the `assurance` stage, which runs only on merge requests targeting the default branch. |
| `main` protection | push: **No one**; merge: **Maintainers**; force push: **off** | "Accepts no direct pushes" is a setting, not a convention. |
| Squash commits | **Always** | Load-bearing. The MR title becomes the single commit subject on the default branch, and that subject is what release automation reads to compute the version and changelog. On `default_off` or `never`, a contributor merges without squashing and the release tooling reads the wrong subjects. |
| Merge method | Merge commit | Group convention, for one review model everywhere. |
| Delete source branch | on | |
| All discussions resolved | required | |
| Pipelines must succeed | required — **only where a pipeline exists** | GitLab: "A merge request with no pipelines at all is not considered to have a successful pipeline, and cannot merge." Enabling this on a repository with no `.gitlab-ci.yml` blocks every merge. Turn it on with the pipeline, not before. |
| Merged results pipelines | on — **only where a pipeline exists** | A merge request's pipeline then tests the merge with its target, not its source alone. Required by merge trains. |
| Merge trains | on — **only where a pipeline exists** | GitLab does not rerun a merge request's pipeline when its target moves, so a green pipeline can describe a stale merge. A train reruns the pipeline against the target as it is when merging. That is what gives `check-release-current` its teeth: a release proposal that lacks the target's tip is dropped from the train instead of tagging notes that undercount what it ships. Every merge waits for that one fresh pipeline. |

A repository is not migrated until these are set. Check them with `glab api "projects/<encoded-path>"` and `glab api "projects/<encoded-path>/protected_branches"` rather than assuming.

Note for this org: the parent `prophetizo` group carries a group-level `develop*` protected-branch rule that every subgroup project inherits. It is inert here because no project has a `develop` branch, and it must not be deleted — projects outside `morphiq-labs` still use `develop` and depend on it.

## Definition of Done

A change is complete only when the root cause is addressed; format, lint, unit, integration, property, mutation, fuzz, benchmark, and formal gates pass in proportion to risk; affected invariants, contracts, compatibility surfaces, migrations, configuration, runbook procedures, and evidence docs are updated together; performance-sensitive changes carry benchmark evidence; the issues resolved are closed by the merge; epic work reaches the default branch only through its signed-off integration MR; and every same-pattern sibling found is fixed. A deferred sibling, untracked debt, or a green test suite alone does not make a change complete.
