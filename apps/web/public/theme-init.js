// Applies a saved theme before first paint (REQ-UI-002). At postbuild, scripts/inline-critical.mjs copies this
// file into every page as an inline script, and the CSP allows it by its SHA-256 hash in _headers, so the policy
// needs no 'unsafe-inline'. Without a saved choice the CSS follows prefers-color-scheme.
(function () {
  try {
    var saved = localStorage.getItem('sf-theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  } catch (e) {
    // Storage blocked: keep the system preference.
  }
})();
