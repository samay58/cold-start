import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-dev/**",
      "**/.next/**",
      "**/.vercel/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.cold-start/**",
      "**/*.tsbuildinfo",
      "apps/web/next-env.d.ts",
      "apps/extension/playwright-report/**",
      "apps/extension/test-results/**",
      "packages/db/drizzle/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly"
      }
    },
    rules: {
      // The base no-unused-vars conflicts with the TS one; defer to TS.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      // Empty catch with intentional ignore is fine; we use it for URL/JSON parse fallbacks.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Allow the `as any`/`as unknown` patterns we use at type boundaries.
      "@typescript-eslint/no-explicit-any": "off",
      // Triple-equals everywhere.
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Lexical correctness.
      "no-undef": "off", // TS handles undefined identifiers at typecheck time.
      "prefer-const": "warn",
      "no-useless-escape": "warn"
    }
  },
  {
    files: ["**/*.tsx", "apps/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["**/tests/**", "**/*.test.ts", "**/*.test.tsx", "eval/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
);
