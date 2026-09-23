import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoadingCard from "../src/app/c/[slug]/loading";

describe("card route loading state", () => {
  it("shows one plain status line and no invented steps", () => {
    const html = renderToStaticMarkup(<LoadingCard />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading profile.");
    expect(html).not.toMatch(/Finding sources|Reading evidence|Filing the card|shimmer/);
  });
});
