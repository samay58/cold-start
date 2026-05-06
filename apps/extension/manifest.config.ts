import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Cold Start",
  version: "0.1.0",
  description: "Sourced company context cards from the current tab.",
  permissions: ["sidePanel", "activeTab", "storage"],
  action: {
    default_title: "Open Cold Start"
  },
  background: {
    service_worker: "src/background.ts",
    type: "module"
  },
  side_panel: {
    default_path: "sidepanel.html"
  },
  host_permissions: ["http://localhost:3000/*", "https://coldstart.semitechie.vc/*"]
});
