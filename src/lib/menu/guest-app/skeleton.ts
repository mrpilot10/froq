/**
 * First-paint + SoftUI-boot skeleton for the customer AI Menu.
 *
 * Two layers:
 * 1. Bootstrap shell (`renderGuestMenuBootstrap`) — returned immediately while
 *    the server builds the SoftUI document; swaps itself for `?_full=1`.
 * 2. SoftUI overlay (`renderGuestMenuSkeleton`) — injected at the start of
 *    `<body>` so the brand shell stays visible until SoftUI paints.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dishRow(titleW: number, descW: number): string {
  return `<div class="fms-row" aria-hidden="true">
  <span class="fms-thumb fms-shimmer"></span>
  <span class="fms-copy">
    <span class="fms-line fms-shimmer" style="width:${titleW}%"></span>
    <span class="fms-line fms-shimmer fms-line--sm" style="width:${descW}%"></span>
    <span class="fms-line fms-shimmer fms-line--xs" style="width:28%"></span>
  </span>
  <span class="fms-price fms-shimmer"></span>
</div>`;
}

function skeletonCss(accent: string, soft: string): string {
  return `
  html, body { margin: 0; background: #F5F7F5; }
  #froq-menu-skel {
    --fms-accent: ${accent};
    --fms-soft: ${soft};
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    background:
      radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--fms-accent) 16%, #F5F7F5) 0%, #F5F7F5 55%);
    color: #0C1A14;
    font-family: ui-rounded, "Fraunces", Georgia, "Times New Roman", serif;
    opacity: 1;
    transition: opacity 0.28s ease, visibility 0.28s ease;
  }
  #froq-menu-skel.is-done {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  #froq-menu-skel * { box-sizing: border-box; }
  .fms-inner {
    width: min(460px, 100%);
    margin: 0 auto;
    padding: 18px 18px 40px;
  }
  .fms-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .fms-logo {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    flex: none;
    background: color-mix(in srgb, var(--fms-accent) 18%, #fff);
  }
  .fms-brand {
    flex: 1;
    min-width: 0;
  }
  .fms-brand-name {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: #0C1A14;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fms-brand-sub {
    margin-top: 6px;
    height: 10px;
    width: 42%;
    border-radius: 999px;
  }
  .fms-chips {
    display: flex;
    gap: 8px;
    overflow: hidden;
    margin: 0 0 16px;
  }
  .fms-chip {
    height: 32px;
    border-radius: 999px;
    flex: none;
    width: 72px;
  }
  .fms-chip:nth-child(2) { width: 86px; }
  .fms-chip:nth-child(3) { width: 64px; }
  .fms-chip:nth-child(4) { width: 78px; }
  .fms-hero {
    height: 148px;
    border-radius: 22px;
    margin-bottom: 20px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--fms-accent) 22%, var(--fms-soft)) 0%,
      color-mix(in srgb, var(--fms-accent) 8%, #fff) 100%
    );
    position: relative;
    overflow: hidden;
  }
  .fms-hero::after {
    content: "";
    position: absolute;
    left: 18px;
    right: 40%;
    bottom: 18px;
    height: 14px;
    border-radius: 8px;
    background: color-mix(in srgb, #fff 55%, transparent);
  }
  .fms-section-label {
    height: 12px;
    width: 96px;
    border-radius: 6px;
    margin: 4px 0 12px;
  }
  .fms-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fms-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px;
    border-radius: 18px;
    background: color-mix(in srgb, #fff 88%, var(--fms-soft));
    border: 1px solid color-mix(in srgb, var(--fms-accent) 8%, transparent);
  }
  .fms-thumb {
    width: 80px;
    height: 80px;
    border-radius: 18px;
    flex: none;
  }
  .fms-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 2px;
  }
  .fms-line {
    display: block;
    height: 12px;
    border-radius: 6px;
  }
  .fms-line--sm { height: 10px; }
  .fms-line--xs { height: 9px; }
  .fms-price {
    width: 42px;
    height: 14px;
    border-radius: 6px;
    flex: none;
    align-self: flex-start;
    margin-top: 2px;
  }
  .fms-shimmer {
    background: linear-gradient(
      100deg,
      color-mix(in srgb, var(--fms-accent) 10%, #e7eee9) 30%,
      color-mix(in srgb, var(--fms-accent) 18%, #f7faf8) 50%,
      color-mix(in srgb, var(--fms-accent) 10%, #e7eee9) 70%
    );
    background-size: 200% 100%;
    animation: fmsSweep 1.25s linear infinite;
  }
  @keyframes fmsSweep {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fms-shimmer { animation: none; }
    #froq-menu-skel { transition: none; }
  }`;
}

function skeletonMarkup(businessName: string): string {
  const brand = escapeHtml(businessName.trim() || "Menu");
  const rows = [
    dishRow(62, 78),
    dishRow(48, 64),
    dishRow(70, 54),
    dishRow(56, 72),
    dishRow(44, 60),
  ].join("");

  return `<div id="froq-menu-skel" role="status" aria-live="polite" aria-busy="true" aria-label="Loading menu">
  <div class="fms-inner">
    <div class="fms-top">
      <span class="fms-logo fms-shimmer" aria-hidden="true"></span>
      <div class="fms-brand">
        <p class="fms-brand-name">${brand}</p>
        <div class="fms-brand-sub fms-shimmer" aria-hidden="true"></div>
      </div>
    </div>
    <div class="fms-chips" aria-hidden="true">
      <span class="fms-chip fms-shimmer"></span>
      <span class="fms-chip fms-shimmer"></span>
      <span class="fms-chip fms-shimmer"></span>
      <span class="fms-chip fms-shimmer"></span>
    </div>
    <div class="fms-hero fms-shimmer" aria-hidden="true"></div>
    <div class="fms-section-label fms-shimmer" aria-hidden="true"></div>
    <div class="fms-list">${rows}</div>
  </div>
</div>`;
}

/** Overlay injected into SoftUI HTML — hides when the menu UI paints. */
export function renderGuestMenuSkeleton(input: {
  businessName: string;
  accent: string;
  accentSoft: string;
}): string {
  const accent = escapeHtml(input.accent || "#16593F");
  const soft = escapeHtml(input.accentSoft || "#E4F0E8");

  return `
<style id="froq-menu-skel-css">${skeletonCss(accent, soft)}</style>
${skeletonMarkup(input.businessName)}
<script>
(function () {
  var sk = document.getElementById("froq-menu-skel");
  if (!sk) return;
  var done = false;
  function hide() {
    if (done || !sk) return;
    done = true;
    sk.classList.add("is-done");
    sk.setAttribute("aria-busy", "false");
    window.setTimeout(function () {
      try {
        var css = document.getElementById("froq-menu-skel-css");
        if (css) css.remove();
        sk.remove();
      } catch (e) {}
    }, 320);
  }
  function uiReady() {
    var dc = document.querySelector("x-dc");
    if (!dc) return false;
    var h = dc.getBoundingClientRect().height;
    return h > 80 && dc.querySelectorAll("*").length > 12;
  }
  function tick() {
    if (uiReady()) {
      hide();
      return;
    }
    window.requestAnimationFrame(tick);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.requestAnimationFrame(tick);
    });
  } else {
    window.requestAnimationFrame(tick);
  }
  // SoftUI paints quickly; don't leave the shell up if detection lags.
  window.setTimeout(hide, 2200);
})();
</script>`;
}

/**
 * Lightweight first response: brand skeleton + fetch full SoftUI document.
 * Avoids a blank screen while resolveMenuPage builds the heavy artifact page.
 */
export function renderGuestMenuBootstrap(input: {
  businessName: string;
  accent: string;
  accentSoft: string;
  fullUrl: string;
}): string {
  const accent = escapeHtml(input.accent || "#16593F");
  const soft = escapeHtml(input.accentSoft || "#E4F0E8");
  const title = escapeHtml(`${input.businessName.trim() || "Menu"} — Menu`);
  const fullUrlJson = JSON.stringify(input.fullUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="theme-color" content="${accent}">
<style>${skeletonCss(accent, soft)}</style>
</head>
<body>
${skeletonMarkup(input.businessName)}
<script>
(function () {
  var url = ${fullUrlJson};
  fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "text/html",
      "x-froq-menu-full": "1",
    },
    cache: "no-store"
  })
    .then(function (res) {
      if (!res.ok) throw new Error("menu_load_failed");
      return res.text();
    })
    .then(function (html) {
      document.open();
      document.write(html);
      document.close();
    })
    .catch(function () {
      window.location.replace(url);
    });
})();
</script>
</body>
</html>`;
}
