import { describe, expect, it, vi } from "vitest";

import { neonFetchWithConnectionRetry, rowsFromExecuteResult } from "../src/client";

describe("rowsFromExecuteResult", () => {
  it("normalizes Neon and node-postgres execute results", () => {
    expect(rowsFromExecuteResult<{ id: number }>([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(rowsFromExecuteResult<{ id: number }>({ rows: [{ id: 2 }] })).toEqual([{ id: 2 }]);
  });

  it("returns no rows for malformed driver results", () => {
    expect(rowsFromExecuteResult(null)).toEqual([]);
    expect(rowsFromExecuteResult({ rows: "not-an-array" })).toEqual([]);
  });
});

function connectTimeoutError() {
  const cause = Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });
  return new TypeError("fetch failed", { cause });
}

describe("neonFetchWithConnectionRetry", () => {
  it("retries one pre-connect timeout and returns the second response", async () => {
    const response = new Response("ok");
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValueOnce(connectTimeoutError()).mockResolvedValueOnce(response);
    const sleep = vi.fn(async () => undefined);
    const dispatcher = {} as never;

    await expect(neonFetchWithConnectionRetry("https://db.example/sql", {}, { fetchFn, sleep, dispatcher })).resolves.toBe(
      response,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ dispatcher });
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("does not retry an ambiguous failure that could have happened after delivery", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      neonFetchWithConnectionRetry("https://db.example/sql", {}, { fetchFn, sleep: async () => undefined }),
    ).rejects.toThrow("fetch failed");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("stops after one retry", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(connectTimeoutError());

    await expect(
      neonFetchWithConnectionRetry("https://db.example/sql", {}, { fetchFn, sleep: async () => undefined }),
    ).rejects.toThrow("fetch failed");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
