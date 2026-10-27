import { BriefAgent as ProductionAgent } from "../src/server";
export { default } from "../src/server";

/** Test-only entrypoint. Production configuration never imports this module. */
export class BriefAgent extends ProductionAgent {
  async onRequest(request: Request): Promise<Response> {
    this.env.AI = {
      run: async () => ({
        response: {
          reply:
            "Let’s start with a small, testable release. Define the input contract first, then verify duplicate delivery is safe.",
          proposals: [
            {
              title: "Define the webhook contract",
              criteria:
                "Valid events are accepted and malformed events return a structured error.",
            },
            {
              title: "Make event handling idempotent",
              criteria:
                "Replaying the same event twice produces one recorded result.",
            },
          ],
        },
      }),
    } as unknown as Ai;
    return super.onRequest(request);
  }
}
