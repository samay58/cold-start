import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next compiles JSX with the automatic runtime; without this, a test that renders a component
  // transformed by vitest fails on a missing React global rather than on anything real.
  esbuild: { jsx: "automatic" },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"]
  }
});
