// Applies a saved theme before first paint (REQ-UI-002). External file, not inline, so the CSP needs no
// 'unsafe-inline'. Without a saved choice the CSS follows prefers-color-scheme.
(function () {
  try {
    var saved = localStorage.getItem('sf-theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  } catch (e) {
    // Storage blocked: keep the system preference.
  }
})();
