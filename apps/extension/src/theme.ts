import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type ThemeReason = "manual" | "dark-reader" | "system" | "default";
export type DarkReaderSignal = "on" | "off" | "unknown";

const PREFERENCE_KEY = "coldStartThemePreference";
const EFFECTIVE_MIRROR_KEY = "coldStartThemeEffective";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/*
 * Precedence: manual override > Dark Reader (active tab) > OS prefers dark >
 * light. An "unknown" Dark Reader signal never forces light; it falls through.
 */
export function resolveTheme(
  preference: ThemePreference,
  darkReader: DarkReaderSignal,
  osPrefersDark: boolean
): { theme: ResolvedTheme; reason: ThemeReason } {
  if (preference === "dark") {
    return { theme: "dark", reason: "manual" };
  }
  if (preference === "light") {
    return { theme: "light", reason: "manual" };
  }
  if (darkReader === "on") {
    return { theme: "dark", reason: "dark-reader" };
  }
  if (osPrefersDark) {
    return { theme: "dark", reason: "system" };
  }
  return { theme: "light", reason: "default" };
}

function isPreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

function osPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

function readMirrorPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return isPreference(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

function readStoredPreference(): Promise<ThemePreference> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([PREFERENCE_KEY], (items) => {
        resolve(isPreference(items[PREFERENCE_KEY]) ? items[PREFERENCE_KEY] : readMirrorPreference());
      });
    } catch {
      resolve(readMirrorPreference());
    }
  });
}

function persistPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(PREFERENCE_KEY, preference);
  } catch {
    /* localStorage may be unavailable */
  }
  try {
    chrome.storage?.local?.set?.({ [PREFERENCE_KEY]: preference });
  } catch {
    /* chrome storage may be unavailable in tests */
  }
}

export function applyResolvedTheme(theme: ResolvedTheme, reason: ThemeReason) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themeReason = reason;
  try {
    localStorage.setItem(EFFECTIVE_MIRROR_KEY, theme);
  } catch {
    /* localStorage may be unavailable */
  }
}

/*
 * Read-only view of the resolved theme for code that needs the value but must
 * not drive it (the generation shader passes colors as JS props). Observes the
 * data-theme attribute the controller writes.
 */
export function useResolvedThemeValue(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function useTheme(darkReaderSignal: DarkReaderSignal = "unknown") {
  const [preference, setPreferenceState] = useState<ThemePreference>(readMirrorPreference);
  const [systemDark, setSystemDark] = useState<boolean>(osPrefersDark);

  useEffect(() => {
    void readStoredPreference().then(setPreferenceState);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }
    const query = window.matchMedia(COLOR_SCHEME_QUERY);
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const { theme, reason } = resolveTheme(preference, darkReaderSignal, systemDark);

  useEffect(() => {
    applyResolvedTheme(theme, reason);
  }, [theme, reason]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persistPreference(next);
  }, []);

  return { preference, setPreference, resolved: theme, reason };
}
