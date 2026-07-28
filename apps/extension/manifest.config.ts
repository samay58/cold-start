import { readFileSync } from "node:fs";
import { defineManifest } from "@crxjs/vite-plugin";
import type { ConfigEnv } from "vite";

// Single version source: apps/extension/package.json. Every AMO signing requires a
// version bump, so a release is one `npm version <part> --no-git-tag-version -w
// @cold-start/extension` (plus `npm install --package-lock-only`), never a hunt for
// hardcoded strings.
const EXTENSION_VERSION = (JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string }).version;

// The retired coldstart.semitechie.vc origin is intentionally absent: extension-config
// treats it as legacy and remaps stored settings to the current API origin, so granting
// it here would only widen the reviewed permission surface.
const PRODUCTION_HOST_PERMISSIONS = [
  "https://cold-start-samay58s-projects.vercel.app/*"
];

const LOCAL_HOST_PERMISSIONS = ["http://localhost:3000/*"];
const ALPHA_INVITE_MATCHES = ["https://cold-start.semitechie.vc/*"];

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
      name: "Cold Start Alpha",
      version: EXTENSION_VERSION,
      description: "Understand a company without leaving its website. Every claim keeps its source.",
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
          },
          // Unlisted builds get no AMO update hosting; the panel self-updates from
          // the public web origin. Baked into the signed XPI, so it must stay the
          // permanent custom domain.
          update_url: "https://cold-start.semitechie.vc/firefox/updates.json"
        }
      },
      incognito: "not_allowed",
      // Firefox's MV3 default extension-pages CSP appends
      // upgrade-insecure-requests, which rewrites the panel's fetches to
      // http://localhost:3000 as https and breaks the local API (Bugzilla
      // 1797086). Local builds drop the directive by overriding the CSP;
      // production builds keep Mozilla's default (the deployed API is https).
      ...(localApiAllowed
        ? {
            content_security_policy: {
              extension_pages: "script-src 'self'; object-src 'self';"
            }
          }
        : {}),
      host_permissions: hostPermissions
    };
  }

  return {
    manifest_version: 3,
    name: "Cold Start Alpha",
    version: EXTENSION_VERSION,
    minimum_chrome_version: "116",
    description: "Understand a company without leaving its website. Every claim keeps its source.",
    permissions: ["sidePanel", "activeTab", "storage"],
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
    externally_connectable: {
      matches: ALPHA_INVITE_MATCHES
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
