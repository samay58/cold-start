import { describe, expect, it } from "vitest";
import { accessFormFailureMessage } from "../src/components/landing/AccessForm";

// AccessForm is a client component; the resting (idle) markup is covered by
// home-page.test.tsx's renderToStaticMarkup pass over the whole landing page.
// @testing-library/react is not installed in this repo, so the interactive fetch-to-copy mapping
// (429 -> rate-limited, 4xx -> check-the-fields, 5xx/network -> our-side fault) is covered here
// as a pure function instead of a mounted component test.
describe("accessFormFailureMessage", () => {
  it("maps 429 to the rate-limited copy", () => {
    expect(accessFormFailureMessage(429)).toBe("Too many requests from here today. Try again tomorrow.");
  });

  it("maps a 400-level failure to the check-the-fields copy", () => {
    expect(accessFormFailureMessage(400)).toBe("That did not send. Check the fields and try again.");
  });

  it("maps a 500-level failure to the our-side-fault copy", () => {
    expect(accessFormFailureMessage(500)).toBe("Something went wrong on our side. Try again in a minute.");
    expect(accessFormFailureMessage(503)).toBe("Something went wrong on our side. Try again in a minute.");
  });

  it("maps a thrown fetch (reported as status 0) to the our-side-fault copy", () => {
    expect(accessFormFailureMessage(0)).toBe("Something went wrong on our side. Try again in a minute.");
  });
});
