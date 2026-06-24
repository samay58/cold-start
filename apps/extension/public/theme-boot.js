/*
 * Pre-paint theme application. Classic (non-module) script so it runs
 * synchronously before the stylesheet and the React module; module scripts are
 * deferred and would paint the wrong theme first. MV3 CSP (script-src 'self')
 * blocks inline scripts, so this lives as an external file in public/.
 *
 * Manual preference wins with no flash. Otherwise the last effective theme is a
 * good guess, then the OS. React reconciles after mount (and the Dark Reader
 * bridge later), which can only happen post-paint.
 */
(function () {
  var root = document.documentElement;
  function osDark() {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  }
  try {
    var pref = localStorage.getItem("coldStartThemePreference");
    if (pref === "dark" || pref === "light") {
      root.dataset.theme = pref;
      return;
    }
    var effective = localStorage.getItem("coldStartThemeEffective");
    if (effective === "dark" || effective === "light") {
      root.dataset.theme = effective;
      return;
    }
    root.dataset.theme = osDark() ? "dark" : "light";
  } catch {
    root.dataset.theme = osDark() ? "dark" : "light";
  }
})();
