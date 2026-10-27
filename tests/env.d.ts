import type { Env as AppEnv } from "../src/server";
import "@cloudflare/vitest-plugin/types";

declare global {
  namespace Cloudflare {
    // Declaration merging augments the platform binding interface.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends AppEnv {}
  }
}
