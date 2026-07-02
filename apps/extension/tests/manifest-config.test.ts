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
});
