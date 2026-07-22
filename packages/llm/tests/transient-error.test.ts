import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { isTransientLlmError } from "../src/index";

describe("isTransientLlmError", () => {
  describe("Anthropic SDK errors", () => {
    it("treats a 529 overloaded error (InternalServerError) as transient", () => {
      const error = new Anthropic.InternalServerError(529, { type: "error", message: "Overloaded" }, "Overloaded", new Headers());
      expect(isTransientLlmError(error)).toBe(true);
    });

    it("treats a 500 InternalServerError as transient", () => {
      const error = new Anthropic.InternalServerError(500, { type: "error", message: "boom" }, "boom", new Headers());
      expect(isTransientLlmError(error)).toBe(true);
    });

    it("treats a 429 RateLimitError as transient", () => {
      const error = new Anthropic.RateLimitError(429, { type: "error", message: "rate limited" }, "rate limited", new Headers());
      expect(isTransientLlmError(error)).toBe(true);
    });

    it("treats an APIConnectionError (no status, network failure) as transient", () => {
      expect(isTransientLlmError(new Anthropic.APIConnectionError({ message: "network down" }))).toBe(true);
    });

    it("treats an APIConnectionTimeoutError as transient", () => {
      expect(isTransientLlmError(new Anthropic.APIConnectionTimeoutError())).toBe(true);
    });

    it("treats a 400 BadRequestError as semantic (not transient)", () => {
      const error = new Anthropic.BadRequestError(400, { type: "error", message: "bad request" }, "bad request", new Headers());
      expect(isTransientLlmError(error)).toBe(false);
    });

    it("treats a 401 AuthenticationError as semantic (not transient)", () => {
      const error = new Anthropic.AuthenticationError(401, { type: "error", message: "unauthorized" }, "unauthorized", new Headers());
      expect(isTransientLlmError(error)).toBe(false);
    });

    it("treats a 422 UnprocessableEntityError as semantic (not transient)", () => {
      const error = new Anthropic.UnprocessableEntityError(422, { type: "error", message: "unprocessable" }, "unprocessable", new Headers());
      expect(isTransientLlmError(error)).toBe(false);
    });
  });

  describe("openai-compat adapter errors", () => {
    it("treats a status-coded 529 message as transient", () => {
      expect(isTransientLlmError(new Error("openai-compat request failed with 529: overloaded"))).toBe(true);
    });

    it("treats a status-coded 429 message as transient", () => {
      expect(isTransientLlmError(new Error("openai-compat request failed with 429: rate limited"))).toBe(true);
    });

    it("treats a status-coded 400 message as semantic (not transient)", () => {
      expect(isTransientLlmError(new Error("openai-compat request failed with 400: bad request"))).toBe(false);
    });

    it("treats a raw fetch TypeError as transient", () => {
      expect(isTransientLlmError(new TypeError("fetch failed"))).toBe(true);
    });

    it("treats an AbortSignal.timeout DOMException-style TimeoutError as transient", () => {
      const error = new Error("The operation timed out.");
      error.name = "TimeoutError";
      expect(isTransientLlmError(error)).toBe(true);
    });
  });

  describe("semantic failures", () => {
    it("treats a ZodError-shaped failure as semantic (not transient)", () => {
      expect(isTransientLlmError(new Error("[\n  {\n    \"code\": \"invalid_type\"\n  }\n]"))).toBe(false);
    });

    it("treats a plain content-validation Error as semantic (not transient)", () => {
      expect(isTransientLlmError(new Error("Synthesis citation ID not found on card: e9"))).toBe(false);
    });

    it("treats a non-Error thrown value as semantic (not transient)", () => {
      expect(isTransientLlmError("not an error")).toBe(false);
    });
  });
});
