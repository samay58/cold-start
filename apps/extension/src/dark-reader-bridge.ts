/*
 * Dark Reader bridge. The side panel is a chrome-extension:// document, so Dark
 * Reader's content scripts never run in it and it cannot see whether Dark Reader
 * is darkening the page. The worker probes the active tab for Dark Reader's DOM
 * markers and stores the result; the panel reads it and recomputes the theme.
 *
 * No-react module so the service worker bundle stays free of React.
 */
export type DarkReaderSignal = "on" | "off" | "unknown";

export const DARK_READER_STORAGE_KEY = "coldStartDarkReader";

export type DarkReaderProbe = {
  state: "on" | "off";
  confidence: "high" | "medium";
};

/*
 * Injected into the active tab via chrome.scripting.executeScript, so it must be
 * self-contained (no outer references). Primary signal is the data-darkreader-*
 * attributes Dark Reader sets on <html>; injected style/meta elements are the
 * weaker fallback. A darkreader-lock meta is an opt-out, not an activation.
 */
export function detectDarkReader(): DarkReaderProbe {
  const root = document.documentElement;
  const mode = root.getAttribute("data-darkreader-mode");
  const scheme = root.getAttribute("data-darkreader-scheme");
  const locked = Boolean(document.querySelector('meta[name="darkreader-lock"]'));
  const hasStyle = Boolean(document.querySelector('style.darkreader, style[class*="darkreader--"]'));
  const hasMeta = Boolean(document.querySelector('meta[name="darkreader"]'));

  if (!locked && mode && (scheme === "dark" || scheme === "dimmed")) {
    return { state: "on", confidence: "high" };
  }
  if (!locked && (hasStyle || hasMeta)) {
    return { state: "on", confidence: "medium" };
  }
  return { state: "off", confidence: "medium" };
}

export function darkReaderSignalFromProbe(probe: DarkReaderProbe | undefined | null): DarkReaderSignal {
  if (probe && (probe.state === "on" || probe.state === "off")) {
    return probe.state;
  }
  return "unknown";
}
