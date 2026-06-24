import { defineManifest } from "@crxjs/vite-plugin";
import type { ConfigEnv } from "vite";

const PRODUCTION_HOST_PERMISSIONS = [
  "https://coldstart.semitechie.vc/*",
  "https://cold-start-samay58s-projects.vercel.app/*"
];

const LOCAL_HOST_PERMISSIONS = ["http://localhost:3000/*"];

export function extensionManifest(env: ConfigEnv) {
  const localApiAllowed =
    env.command === "serve" ||
    env.mode !== "production" ||
    process.env.VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN === "true";

  return {
    manifest_version: 3,
    name: "Cold Start",
    version: "0.1.0",
    description: "Sourced company context cards from the current tab.",
    permissions: ["sidePanel", "activeTab", "storage", "scripting"],
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    },
    action: {
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png"
      },
      default_title: "Open Cold Start"
    },
    background: {
      service_worker: "src/background.ts",
      type: "module"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    host_permissions: [
      ...PRODUCTION_HOST_PERMISSIONS,
      ...(localApiAllowed ? LOCAL_HOST_PERMISSIONS : [])
    ]
  };
}

export default defineManifest(extensionManifest);
