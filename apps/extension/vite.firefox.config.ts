import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { firefoxManifest } from "./manifest.config";

// Build-only config: Firefox blocks localhost script sources for temporarily
// loaded extensions before 147, so there is no dev-server/HMR lane. Iterate with
// `vite build --watch -c vite.firefox.config.ts` plus `web-ext run`.
export default defineConfig({
  envDir: "../..",
  build: {
    emptyOutDir: true,
    outDir: "dist-firefox",
    rollupOptions: {
      // CRXJS discovers HTML entries from the manifest keys it knows
      // (side_panel.default_path among them) and never reads
      // sidebar_action.default_panel, so the sidebar document must be named
      // as an input or the build silently omits it.
      input: {
        sidepanel: "sidepanel.html"
      }
    }
  },
  plugins: [react(), crx({ manifest: firefoxManifest, browser: "firefox" })]
});
