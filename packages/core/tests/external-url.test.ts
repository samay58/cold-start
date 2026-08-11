import { describe, expect, it } from "vitest";

import { MAX_EXTERNAL_URL_LENGTH, safePublicImageUrl, safeWebUrl } from "../src/external-url";

describe("safeWebUrl", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "custom:handler",
    "https://user:secret@example.com/path",
    "not a url",
    `https://example.com/${"x".repeat(MAX_EXTERNAL_URL_LENGTH)}`
  ])("rejects %s", (url) => {
    expect(safeWebUrl(url)).toBeNull();
  });

  it.each(["http://example.com/profile", "https://cdn.example.com/a.png"])("accepts %s", (url) => {
    expect(safeWebUrl(url)).toBe(url);
  });
});

describe("safePublicImageUrl", () => {
  it.each([
    "http://cdn.example.com/a.png",
    "https://user:secret@cdn.example.com/a.png",
    "https://localhost/a.png",
    "https://localhost./a.png",
    "https://app.local/a.png",
    "https://app.local./a.png",
    "https://service.internal/a.png",
    "https://127.0.0.1/a.png",
    "https://10.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.1/a.png",
    "https://203.0.113.4/a.png",
    "https://[::1]/a.png",
    "https://example.test/a.png",
    "https://hidden-service.onion/a.png",
    "data:image/png;base64,abc"
  ])("rejects %s", (url) => {
    expect(safePublicImageUrl(url)).toBeNull();
  });

  it("accepts a public HTTPS CDN URL", () => {
    expect(safePublicImageUrl("https://images.example-cdn.com/company/card.png")).toBe(
      "https://images.example-cdn.com/company/card.png"
    );
  });
});
