import { describe, expect, it } from "vitest";
import { extensionManifest } from "../manifest.config";

describe("extensionManifest", () => {
  it("does not ship localhost host permissions in production builds", () => {
    const manifest = extensionManifest({ command: "build", mode: "production" });

    expect(manifest.host_permissions).toEqual([
      "https://cold-start-samay58s-projects.vercel.app/*"
    ]);
  });

  it("keeps localhost host permissions for the dev server", () => {
    const manifest = extensionManifest({ command: "serve", mode: "development" });

    expect(manifest.host_permissions).toContain("http://localhost:3000/*");
  });

  it("grants the favicon permission for browser-cached clipping icons", () => {
    const manifest = extensionManifest({ command: "build", mode: "production" });

    expect(manifest.permissions).toContain("favicon");
  });

  it("builds the firefox variant with sidebar_action and no Chrome-only permissions", () => {
    type FirefoxManifest = Extract<ReturnType<typeof extensionManifest>, { sidebar_action: unknown }>;
    const manifest = extensionManifest({ command: "build", mode: "production" }, "firefox") as FirefoxManifest;

    if (!("sidebar_action" in manifest)) {
      throw new Error("expected the firefox manifest variant");
    }

    expect(manifest.permissions).toEqual(["activeTab", "storage"]);
    expect(manifest.sidebar_action.default_panel).toBe("sidepanel.html");
    expect(manifest.sidebar_action.open_at_install).toBe(false);
    expect(manifest.browser_specific_settings.gecko.id).toBe("cold-start@semitechie.vc");
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe("140.0");
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions.required).toEqual(["browsingActivity"]);
    expect(manifest.incognito).toBe("not_allowed");
    // CRXJS 2.7.1's firefox target requires the event-page shape in source; it
    // does not translate a service_worker key (crashes in renderCrxManifest).
    expect(manifest.background.scripts).toEqual(["src/background.ts"]);
    expect(manifest.host_permissions).toEqual(["https://cold-start-samay58s-projects.vercel.app/*"]);
  });
});
