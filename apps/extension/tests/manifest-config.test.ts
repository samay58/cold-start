import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extensionManifest } from "../manifest.config";

describe("extensionManifest", () => {
  it("sources its version from the extension package.json so a release is one bump", () => {
    const packageVersion = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    }).version;

    expect(extensionManifest({ command: "build", mode: "production" }).version).toBe(packageVersion);
    expect(extensionManifest({ command: "build", mode: "production" }, "firefox").version).toBe(packageVersion);
  });

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

  it("keeps the Chrome install surface narrow and connects only the branded invite page", () => {
    const manifest = extensionManifest({ command: "build", mode: "production" });

    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.permissions).toEqual(["sidePanel", "activeTab", "storage"]);
    expect(manifest.externally_connectable).toEqual({
      matches: ["https://cold-start.semitechie.vc/*"]
    });
    expect("browser_specific_settings" in manifest).toBe(false);
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
    // Unlisted builds get no AMO update hosting; updates are self-hosted from the
    // public web origin. The url is baked into the signed XPI, so it must be the
    // permanent custom domain, never a vercel.app deployment origin.
    expect(manifest.browser_specific_settings.gecko.update_url).toBe(
      "https://cold-start.semitechie.vc/firefox/updates.json"
    );
    expect(manifest.incognito).toBe("not_allowed");
    // CRXJS 2.7.1's firefox target requires the event-page shape in source; it
    // does not translate a service_worker key (crashes in renderCrxManifest).
    expect(manifest.background.scripts).toEqual(["src/background.ts"]);
    expect(manifest.host_permissions).toEqual(["https://cold-start-samay58s-projects.vercel.app/*"]);
    // Production keeps Firefox's default extension-pages CSP (with its
    // upgrade-insecure-requests); only local-API builds override it, because
    // the directive rewrites http://localhost fetches to https and kills them.
    expect(manifest.content_security_policy).toBeUndefined();

    const devManifest = extensionManifest({ command: "serve", mode: "development" }, "firefox") as FirefoxManifest;
    expect(devManifest.content_security_policy?.extension_pages).toContain("script-src 'self'");
    expect(devManifest.content_security_policy?.extension_pages).not.toContain("upgrade-insecure-requests");
  });
});
