import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "../src/app/not-found";

describe("not-found page", () => {
  it("names the missing card plainly and links to the catalog and home", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("No card is filed under this link.");
    expect(html).toContain('href="/catalog"');
    expect(html).toContain('href="/"');
  });
});
