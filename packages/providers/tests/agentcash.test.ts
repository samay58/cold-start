import { describe, expect, it } from "vitest";
import {
  agentcashChildEnv,
  agentcashJson,
  buildAgentcashFetchArgs,
  buildAgentcashFetchCommand,
  parseAgentcashOutput,
  resolveAgentcashCliPath,
} from "../src/agentcash";

describe("buildAgentcashFetchArgs", () => {
  it("builds wallet-backed AgentCash fetch args without API keys", () => {
    expect(
      buildAgentcashFetchArgs({
        url: "https://stableenrich.dev/api/exa/search",
        body: { query: "cartesia funding", numResults: 3 },
      }),
    ).toEqual([
      "fetch",
      "https://stableenrich.dev/api/exa/search",
      "-m",
      "POST",
      "-b",
      '{"query":"cartesia funding","numResults":3}',
      "-y",
      "--format",
      "json",
    ]);
  });

  it("keeps npx as an explicit override instead of the runtime default", () => {
    expect(
      buildAgentcashFetchArgs({
        command: "npx",
        packageName: "agentcash@0.14.4",
        url: "https://stableenrich.dev/api/exa/search",
        body: { query: "cartesia funding" },
      }),
    ).toEqual([
      "agentcash@0.14.4",
      "fetch",
      "https://stableenrich.dev/api/exa/search",
      "-m",
      "POST",
      "-b",
      '{"query":"cartesia funding"}',
      "-y",
      "--format",
      "json",
    ]);
  });
});

describe("buildAgentcashFetchCommand", () => {
  it("resolves the installed CLI from nested workspace directories", () => {
    expect(resolveAgentcashCliPath(`${process.cwd()}/apps/web`)).toMatch(/agentcash.*dist\/esm\/index\.js$/);
  });

  it("uses the installed AgentCash CLI by default", () => {
    const command = buildAgentcashFetchCommand({
      url: "https://stableenrich.dev/api/exa/search",
      body: { query: "cartesia funding" },
    });

    expect(command.command).toBe(process.execPath);
    expect(command.args[0]).toMatch(/agentcash.*dist\/esm\/index\.js$/);
    expect(command.args.slice(1)).toEqual([
      "fetch",
      "https://stableenrich.dev/api/exa/search",
      "-m",
      "POST",
      "-b",
      '{"query":"cartesia funding"}',
      "-y",
      "--format",
      "json",
    ]);
  });
});

describe("agentcashChildEnv", () => {
  it("keeps an existing home directory for local wallet-backed calls", () => {
    const env = agentcashChildEnv({
      baseEnv: { HOME: process.cwd() },
      fallbackHome: "/tmp/cold-start-agentcash-test",
    });

    expect(env.HOME).toBe(process.cwd());
  });

  it("uses a writable fallback when the runtime home directory is missing", () => {
    const env = agentcashChildEnv({
      baseEnv: { HOME: "/tmp/cold-start-agentcash-home-does-not-exist" },
      fallbackHome: "/tmp/cold-start-agentcash-test",
    });

    expect(env.HOME).toBe("/tmp/cold-start-agentcash-test");
  });
});

describe("parseAgentcashOutput", () => {
  it("unwraps successful AgentCash JSON envelopes", () => {
    expect(parseAgentcashOutput('{"success":true,"data":{"results":[{"title":"ok"}]}}')).toEqual({
      results: [{ title: "ok" }],
    });
  });

  it("rejects AgentCash error envelopes", () => {
    expect(() =>
      parseAgentcashOutput('{"success":false,"error":{"message":"insufficient balance"}}'),
    ).toThrow("insufficient balance");
  });
});

describe("agentcashJson", () => {
  it("executes AgentCash through an injected process runner", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = await agentcashJson<{ ok: true }>({
      url: "https://stableenrich.dev/api/firecrawl/scrape",
      body: { url: "https://cartesia.ai" },
      runAgentcash: async (command, args) => {
        calls.push({ command, args });
        return '{"success":true,"data":{"ok":true}}';
      },
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.command).toBe(process.execPath);
    expect(calls[0]?.args[0]).toMatch(/agentcash.*dist\/esm\/index\.js$/);
    expect(calls[0]?.args.slice(1)).toEqual([
      "fetch",
      "https://stableenrich.dev/api/firecrawl/scrape",
      "-m",
      "POST",
      "-b",
      '{"url":"https://cartesia.ai"}',
      "-y",
      "--format",
      "json",
    ]);
  });
});
