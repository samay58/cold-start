import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAlphaInvitation, detectedAlphaBrowser, inviteTokenFromInput } from "../src/shared/alpha-connect";

// Firefox's storage schema exposes only get/set/remove/clear on storage.local:
// there is no setAccessLevel there, so the firefox-shaped runtime must omit it
// or the harness hides the exact TypeError that burned a live invite (2026-07-28).
function installChrome({ firefox, setAccessLevel }: {
  firefox: boolean;
  setAccessLevel?: ReturnType<typeof vi.fn> | undefined;
}) {
  const storageItems: Record<string, unknown> = {};
  const accessLevelMock = firefox
    ? undefined
    : setAccessLevel ?? vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    runtime: {
      id: firefox ? "cold-start@semitechie.vc" : "extension-test-id",
      lastError: undefined,
      getManifest: () => ({ version: "0.2.1" })
    },
    ...(firefox ? {} : { sidePanel: { open: vi.fn() } }),
    storage: {
      local: {
        get: (keys: readonly string[], callback: (items: Record<string, unknown>) => void) => {
          callback(Object.fromEntries(keys.map((key) => [key, storageItems[key]])));
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(storageItems, items);
          callback?.();
        },
        ...(accessLevelMock ? { setAccessLevel: accessLevelMock } : {})
      }
    }
  });
  return { storageItems, setAccessLevel: accessLevelMock };
}

const connectedBody = {
  ok: true,
  state: "connected",
  accessToken: "credential-abc",
  installationSuffix: "a1b2c3",
  compatibility: "current",
  generationEnabled: true,
  allowance: {
    profile: { limit: 12, remaining: 12 },
    lens: { limit: 6, remaining: 6 }
  }
};

describe("inviteTokenFromInput", () => {
  const token = "a".repeat(32);

  it("accepts a bare invitation token", () => {
    expect(inviteTokenFromInput(`  ${token}  `)).toBe(token);
  });

  it("extracts the token from a full invitation link in either fragment form", () => {
    expect(inviteTokenFromInput(`https://cold-start.semitechie.vc/alpha#invite=${token}`)).toBe(token);
    expect(inviteTokenFromInput(`https://cold-start.semitechie.vc/alpha#${token}`)).toBe(token);
  });

  it("rejects malformed input", () => {
    expect(inviteTokenFromInput("hello")).toBeNull();
    expect(inviteTokenFromInput("https://cold-start.semitechie.vc/alpha")).toBeNull();
    expect(inviteTokenFromInput(`raw ${token} extra`)).toBeNull();
    expect(inviteTokenFromInput("")).toBeNull();
  });

  it("accepts a bare word code and a full /i/ link", () => {
    expect(inviteTokenFromInput("ember-quarto-lark")).toBe("ember-quarto-lark");
    expect(
      inviteTokenFromInput("https://cold-start.semitechie.vc/i/dad#ember-quarto-lark")
    ).toBe("ember-quarto-lark");
  });
});

describe("alpha-connect", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects the browser from the sidePanel feature gate", () => {
    installChrome({ firefox: true });
    expect(detectedAlphaBrowser()).toBe("firefox");

    installChrome({ firefox: false });
    expect(detectedAlphaBrowser()).toBe("chrome");
  });

  it("redeems with browser firefox from a Firefox-shaped runtime and stores the credential", async () => {
    const { storageItems } = installChrome({ firefox: true });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(connectedBody), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await connectAlphaInvitation({
      inviteToken: "a".repeat(32),
      storeVisited: false,
      reducedMotion: false,
      theme: "light"
    });

    expect(response).toMatchObject({ ok: true, state: "connected" });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/api/alpha/invite/redeem");
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      browser: "firefox",
      consent: true
    });
    expect(storageItems.coldStartApiToken).toBe("credential-abc");
    expect(JSON.stringify(response)).not.toContain("credential-abc");
  });

  it("still stores the credential when setAccessLevel rejects", async () => {
    const { storageItems } = installChrome({
      firefox: false,
      setAccessLevel: vi.fn(async () => {
        throw new Error("access level unavailable");
      })
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(connectedBody), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));

    const response = await connectAlphaInvitation({
      inviteToken: "a".repeat(32),
      storeVisited: false,
      reducedMotion: false,
      theme: "light"
    });

    expect(response).toMatchObject({ ok: true, state: "connected" });
    expect(storageItems.coldStartApiToken).toBe("credential-abc");
  });

  it("applies the access level restriction on runtimes that support it", async () => {
    const { storageItems, setAccessLevel } = installChrome({ firefox: false });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(connectedBody), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));

    await connectAlphaInvitation({
      inviteToken: "a".repeat(32),
      storeVisited: false,
      reducedMotion: false,
      theme: "light"
    });

    expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(storageItems.coldStartApiToken).toBe("credential-abc");
  });

  it("redeems with browser chrome when the sidePanel API exists", async () => {
    installChrome({ firefox: false });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(connectedBody), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await connectAlphaInvitation({
      inviteToken: "a".repeat(32),
      storeVisited: true,
      reducedMotion: true,
      theme: "dark"
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({ browser: "chrome" });
  });

  it("maps auth-shaped failures without throwing", async () => {
    installChrome({ firefox: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "expired" }), {
      status: 410,
      headers: { "Content-Type": "application/json" }
    })));

    const response = await connectAlphaInvitation({
      inviteToken: "a".repeat(32),
      storeVisited: false,
      reducedMotion: false,
      theme: "light"
    });

    expect(response).toMatchObject({ ok: false, code: "expired" });
  });
});
