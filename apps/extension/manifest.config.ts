import { defineManifest } from "@crxjs/vite-plugin";
import type { ConfigEnv } from "vite";

// The retired coldstart.semitechie.vc origin is intentionally absent: extension-config
// treats it as legacy and remaps stored settings to the current API origin, so granting
// it here would only widen the reviewed permission surface.
const PRODUCTION_HOST_PERMISSIONS = [
  "https://cold-start-samay58s-projects.vercel.app/*"
];

const LOCAL_HOST_PERMISSIONS = ["http://localhost:3000/*"];

const ICONS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png"
};

// The Chrome branch below must keep its exact key order: dist/manifest.json is
// serialized in insertion order and the Chrome output is diffed for byte stability.
export function extensionManifest(env: ConfigEnv, browser: "chrome" | "firefox" = "chrome") {
  const localApiAllowed =
    env.command === "serve" ||
    env.mode !== "production" ||
    process.env.VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN === "true";

  const hostPermissions = [
    ...PRODUCTION_HOST_PERMISSIONS,
    ...(localApiAllowed ? LOCAL_HOST_PERMISSIONS : [])
  ];

  if (browser === "firefox") {
    return {
      manifest_version: 3,
      name: "Cold Start",
      version: "0.1.0",
      description: "Sourced company context cards from the current tab.",
      // No sidePanel (Chrome-only API) and no favicon (Chrome-only _favicon/ URL;
      // clipping-model falls back to null icons when the permission is absent).
      permissions: ["activeTab", "storage"],
      icons: ICONS,
      action: {
        default_icon: ICONS,
        default_title: "Open Cold Start"
      },
      // Firefox has no MV3 service workers. CRXJS 2.7.1 does NOT translate a
      // service_worker source key for its firefox target (renderCrxManifest reads
      // background.scripts[0] unguarded and crashes), so the source manifest must
      // declare the event-page shape itself; the emitted manifest gets the built
      // loader in background.scripts.
      background: {
        scripts: ["src/background.ts"]
      },
      // open_at_install defaults to true on Firefox; never auto-open the sidebar.
      sidebar_action: {
        default_panel: "sidepanel.html",
        default_title: "Cold Start",
        default_icon: ICONS,
        open_at_install: false
      },
      browser_specific_settings: {
        gecko: {
          // Permanent identity: changing this ID makes Firefox treat the result
          // as a different extension. runtime.id returns this value, so the
          // x-cold-start-extension-id header carries it unchanged.
          id: "cold-start@semitechie.vc",
          // Firefox 140 is the floor where the built-in data-consent UI exists,
          // letting data_collection_permissions be the only consent surface.
          strict_min_version: "140.0",
          data_collection_permissions: {
            required: ["browsingActivity" as const]
          }
        }
      },
      incognito: "not_allowed",
      host_permissions: hostPermissions
    };
  }

  return {
    manifest_version: 3,
    name: "Cold Start",
    version: "0.1.0",
    description: "Sourced company context cards from the current tab.",
    // "favicon" backs chrome.runtime.getURL("_favicon/...") for clippings: a browser-cached
    // icon lookup with no external request.
    permissions: ["sidePanel", "activeTab", "storage", "favicon"],
    icons: ICONS,
    action: {
      default_icon: ICONS,
      default_title: "Open Cold Start"
    },
    background: {
      service_worker: "src/background.ts",
      type: "module"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    host_permissions: hostPermissions
  };
}

// CRXJS 2.7.1's ManifestV3 type has no sidebar_action key (it does type
// browser_specific_settings.gecko, including data_collection_permissions), so the
// Firefox variant passes through defineManifest as a widened function return
// rather than a checked literal.
export const firefoxManifest = defineManifest((env: ConfigEnv) => extensionManifest(env, "firefox"));

export default defineManifest(extensionManifest);
