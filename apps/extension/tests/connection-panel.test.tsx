// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionPanel } from "../src/sidepanel";

const INVITE_TOKEN = "b".repeat(32);

function installChrome({ firefox }: { firefox: boolean }) {
  const storageItems: Record<string, unknown> = {};
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
        setAccessLevel: vi.fn(async () => undefined)
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    }
  });
  return { storageItems };
}

function connectedResponse() {
  return new Response(JSON.stringify({
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
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("ConnectionPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    })));
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function render(onConnected = vi.fn()) {
    act(() => {
      root = createRoot(container);
      root.render(
        <ConnectionPanel
          onConnected={onConnected}
          onSupport={vi.fn()}
          onThemePreferenceChange={vi.fn()}
          themePreference="light"
        />
      );
    });
    return onConnected;
  }

  function inviteInput() {
    return container.querySelector<HTMLInputElement>(".cs-invite-code-input");
  }

  async function submitInvite(value: string) {
    const input = inviteInput();
    const form = input?.closest("form");
    if (!input || !form) {
      throw new Error("invitation form not rendered");
    }
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("hides the invitation form on Chrome, where the invite page connects", () => {
    installChrome({ firefox: false });
    render();

    expect(inviteInput()).toBeNull();
    expect(container.textContent).toContain("Return to the invitation Samay sent you");
  });

  it("redeems a pasted invitation link on Firefox and reports the connection", async () => {
    installChrome({ firefox: true });
    const fetchMock = vi.fn(async () => connectedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const onConnected = render();

    await submitInvite(`https://cold-start.semitechie.vc/alpha#invite=${INVITE_TOKEN}`);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/api/alpha/invite/redeem");
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      inviteToken: INVITE_TOKEN,
      browser: "firefox",
      consent: true
    });
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it("shows the public-card disclosure ahead of the Firefox connect action", () => {
    installChrome({ firefox: true });
    render();

    expect(container.textContent).toContain("public sourced fact card");
  });

  it("rejects malformed input without a network request", async () => {
    installChrome({ firefox: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onConnected = render();

    await submitInvite("not-an-invitation");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Paste the full invitation link");
  });

  it("surfaces a readable error when the invitation is expired", async () => {
    installChrome({ firefox: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "expired" }), {
      status: 410,
      headers: { "Content-Type": "application/json" }
    })));
    const onConnected = render();

    await submitInvite(INVITE_TOKEN);

    expect(onConnected).not.toHaveBeenCalled();
    expect(container.textContent).toContain("expired");
  });
});
