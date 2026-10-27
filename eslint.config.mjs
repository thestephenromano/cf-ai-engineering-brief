import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", ".wrangler/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        structuredClone: "readonly",
        TextEncoder: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  {
    files: ["src/domain.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "./server*",
            "./model*",
            "cloudflare:*",
            "agents*",
            "node:*",
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Identifier[name=/^(Date|crypto|fetch|performance)$/]",
          message:
            "Domain transitions must replay deterministically; pass external values in.",
        },
        {
          selector:
            "MemberExpression[object.name='Math'][property.name='random']",
          message: "No random values in deterministic transitions.",
        },
      ],
    },
  },
);
