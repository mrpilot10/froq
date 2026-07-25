/* Captures beforeinstallprompt early and registers the service worker. */
(function () {
  if (typeof window === "undefined") return;
  window.__froqInstallPrompt = window.__froqInstallPrompt ?? null;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    window.__froqInstallPrompt = e;
    window.dispatchEvent(new Event("froq:installprompt"));
  });

  window.addEventListener("appinstalled", function () {
    window.__froqInstallPrompt = null;
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
    });
  }
})();
