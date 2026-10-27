# AI-assisted coding prompt history

Date: 2026-10-27. Tool: Codex in a local development workspace.

This records the human task prompts used in this coding session. Repository
policy files, environment metadata, tool output, and the assistant's private
reasoning are not reproduced. The implementation and tests were generated and
iteratively corrected by the assistant; there were no separate hidden human
implementation prompts. This is a task-prompt record, not a raw session export.

## 1. Initial task (verbatim)

> Perform a coding exercise to build an AI-powered application on Cloudflare. Here are the details of the assignment:
>
> https://developers.cloudflare.com/agents/
>
> Use the Assay program, and templates for AI-assisted engineering from the `ai-program` repo.

## 2. App choice

The assistant asked whether there were additional assignment requirements or a
preferred app idea, proposing an engineering brief assistant with persistent
chat, Workers AI, and reviewable task proposals.

User selection (verbatim):

> Proceed with the engineering brief assistant

## 3. Assignment screenshot

The user supplied an assignment screenshot and wrote (verbatim):

> This is all i have

Transcription of its relevant requirements:

> Optional Assignment: Please share GitHub repo URL for the project here
>
> We plan to fast track candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
>
> - LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
> - Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
> - User input via chat or voice (recommend using Pages or Realtime)
> - Memory or state
>
> Note: AI-assisted coding is encouraged, but you have to submit prompt history.

## 4. Continue after environment permissions changed (verbatim)

> proceed

## 5. CI/CD requirement (verbatim)

> Ensure there is GitHub CI/CD included

## 6. Repository creation (verbatim)

> create a new GitHUb project, commit and push to it.

## Implementation iterations (retrospective summary, not additional prompts)

- Read the Cloudflare documentation and local engineering templates; defined
  state and approval obligations before application code.
- Implemented bounded chat, validated AI proposals, explicit task decisions,
  isolated persistent sessions, and responsive React UI.
- Replaced the deprecated Cloudflare test package after the dependency audit
  identified vulnerable transitive dependencies.
- Tested runtime state transitions, retries, malformed output, concurrent writes,
  session isolation and durable recovery; corrected test response-body handling
  and isolated test sessions to avoid unsafe shared-runtime teardown.
- Exercised desktop/mobile browser flows and network-failure retries.
- Added GitHub Actions verification, artifact retention, and manual deployment
  through a production Environment.

## Runtime application prompt

The exact system prompt sent to Workers AI is versioned in
[`src/model.ts`](src/model.ts), constant `SYSTEM`. The same file defines the
complete context assembly and JSON response schema. User prompts are the
messages entered into the application; synthetic test prompts appear in `tests/`.
