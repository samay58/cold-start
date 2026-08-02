import { describe, expect, it } from "vitest";
import { accessFormFailureMessage } from "../src/components/landing/AccessForm";

// AccessForm is a client component; the resting (idle) markup is covered by
// home-page.test.tsx's renderToStaticMarkup pass over the whole landing page.
// @testing-library/react is not installed in this repo, so the interactive fetch-to-copy mapping
// (Step 2 of the task-17 brief: 429 -> the rate-limited line, anything else -> the generic
// failure line) is covered here as a pure function instead of a mounted component test.
describe("accessFormFailureMessage", () => {
  it("maps 429 to the rate-limited copy", () => {
    expect(accessFormFailureMessage(429)).toBe("Too many requests from here today. Try again tomorrow.");
  });

  it("maps every other status, including network failures (0), to the generic failure copy", () => {
    expect(accessFormFailureMessage(400)).toBe("That did not send. Check the fields and try again.");
    expect(accessFormFailureMessage(500)).toBe("That did not send. Check the fields and try again.");
    expect(accessFormFailureMessage(0)).toBe("That did not send. Check the fields and try again.");
  });
});
