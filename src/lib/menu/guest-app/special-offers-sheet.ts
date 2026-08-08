import { OTP_LENGTH, RESEND_SECONDS } from "@/lib/auth/otp/config";

export type SpecialOffersSheetConfig = {
  slug: string;
  branchId: string | null;
  tableNumber: number | null;
  businessName: string;
  accent: string;
  /** Kept for API compatibility; the guest sheet no longer shows Turnstile. */
  turnstileSiteKey?: string;
  /** Delay after page load before showing the required form (ms). */
  delayMs?: number;
  /**
   * Queue / WhatsApp deep-link guest (`frq_…`). When set, verification is
   * skipped and localStorage remembers the guest so the sheet never reappears.
   */
  skipVerifyToken?: string | null;
};

/**
 * Self-contained bottom sheet injected into the SoftUI guest menu document.
 * Blocks the menu until the guest verifies their details (no skip / dismiss),
 * unless `skipVerifyToken` is set (queue guest already identified).
 */
export function renderSpecialOffersSheet(config: SpecialOffersSheetConfig): string {
  const delayMs = config.delayMs ?? 400;
  const cfg = {
    slug: config.slug,
    branchId: config.branchId,
    tableNumber: config.tableNumber,
    businessName: config.businessName,
    accent: config.accent || "#16593F",
    delayMs,
    otpLength: OTP_LENGTH,
    resendSeconds: RESEND_SECONDS,
    skipVerifyToken: (config.skipVerifyToken ?? "").trim() || null,
  };

  return `<style id="froq-so-style">
#froq-so-root{position:fixed;inset:0;z-index:95;display:none;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#0C1A14}
#froq-so-root.is-open{display:flex}
#froq-so-bg{position:absolute;inset:0;background:rgba(8,22,16,.55)}
#froq-so-sheet{position:relative;width:100%;max-width:460px;max-height:min(94vh,780px);overflow:auto;background:#fff;border-radius:26px 26px 0 0;padding:10px 18px 22px;animation:froqSoUp .26s cubic-bezier(.22,.9,.3,1);box-sizing:border-box;-webkit-overflow-scrolling:touch}
#froq-so-handle{width:40px;height:4px;border-radius:999px;background:#DCE5DF;margin:0 auto 10px}
#froq-so-head{margin:0 0 6px}
#froq-so-title{font-size:21px;font-weight:800;letter-spacing:-.5px;line-height:1.2;margin:0}
#froq-so-sub{margin:0 0 14px;font-size:13.5px;font-weight:500;line-height:1.4;color:#5A6E62}
#froq-so-form{display:flex;flex-direction:column;gap:10px}
.froq-so-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.froq-so-field{display:flex;flex-direction:column;gap:5px}
.froq-so-field label{font-size:11.5px;font-weight:700;color:#5A6E62;letter-spacing:.02em}
.froq-so-field input,.froq-so-field select{height:48px;border-radius:14px;border:1.5px solid #E1E9E4;padding:0 13px;font:inherit;font-size:16px;font-weight:600;color:#0C1A14;background:#F7FAF8;outline:none;width:100%;box-sizing:border-box}
.froq-so-field input:focus,.froq-so-field select:focus{border-color:var(--froq-so-accent,#16593F);background:#fff}
.froq-so-phone{display:flex;align-items:center;gap:0;height:48px;border-radius:14px;border:1.5px solid #E1E9E4;overflow:hidden;background:#F7FAF8}
.froq-so-phone:focus-within{border-color:var(--froq-so-accent,#16593F);background:#fff}
.froq-so-phone span{flex:none;padding:0 12px;font-size:14px;font-weight:700;color:#5A6E62;background:#EEF3F0;border-right:1px solid #E1E9E4;height:100%;display:flex;align-items:center}
.froq-so-phone input{border:0;height:100%;border-radius:0;flex:1;min-width:0;background:transparent}
#froq-so-error{display:none;margin:2px 0 0;padding:9px 12px;border-radius:12px;background:#FEF2F2;color:#B91C1C;font-size:13px;font-weight:600;line-height:1.35}
#froq-so-error.is-on{display:block}
#froq-so-cta{margin-top:12px;width:100%;height:52px;border:0;border-radius:15px;background:var(--froq-so-accent,#16593F);color:#fff;font:inherit;font-size:15.5px;font-weight:800;cursor:pointer}
#froq-so-cta:disabled{opacity:.55;cursor:not-allowed}
#froq-so-back{display:none;width:100%;margin-top:6px;padding:10px;border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:650;color:#5A6E62;cursor:pointer}
#froq-so-back.is-on{display:block}
.froq-so-otp{display:flex;gap:8px;justify-content:center;margin:4px 0 2px}
.froq-so-otp input{width:44px;height:50px;text-align:center;font-size:20px;font-weight:800;border-radius:14px;border:1.5px solid #E1E9E4;background:#F7FAF8;outline:none}
.froq-so-otp input:focus{border-color:var(--froq-so-accent,#16593F);background:#fff}
@keyframes froqSoUp{from{transform:translateY(28px);opacity:.6}to{transform:translateY(0);opacity:1}}
@media (max-width:420px){.froq-so-row{grid-template-columns:1fr}}
</style>
<div id="froq-so-root" aria-hidden="true">
  <div id="froq-so-bg" aria-hidden="true"></div>
  <div id="froq-so-sheet" role="dialog" aria-modal="true" aria-labelledby="froq-so-title">
    <div id="froq-so-handle"></div>
    <div id="froq-so-head">
      <h2 id="froq-so-title">Verify Your Details</h2>
    </div>
    <p id="froq-so-sub"></p>
    <div id="froq-so-body"></div>
    <div id="froq-so-error" role="alert"></div>
    <button type="button" id="froq-so-cta"></button>
    <button type="button" id="froq-so-back">Edit details</button>
  </div>
</div>
<script>
(function () {
  var CFG = ${JSON.stringify(cfg)};
  var STORAGE_KEY = "froq-menu-verify-" + CFG.slug;
  var root = document.getElementById("froq-so-root");
  if (!root || !CFG.slug) return;

  function rememberDone() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch (e) {}
  }

  // Queue guests arrive with ?guest=frq_… — reuse queue identity, no OTP sheet.
  if (CFG.skipVerifyToken) {
    rememberDone();
    return;
  }

  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
  } catch (e) {}

  var step = "form";
  var form = {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthdate: "",
    partySize: 2,
    otp: ""
  };
  var busy = false;
  var resendLeft = 0;
  var resendTimer = null;

  root.style.setProperty("--froq-so-accent", CFG.accent || "#16593F");

  function openSheet() {
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    render();
  }

  function closeSheet() {
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  function showError(msg) {
    var el = document.getElementById("froq-so-error");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.add("is-on");
    } else {
      el.textContent = "";
      el.classList.remove("is-on");
    }
  }

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
        if (!res.ok && !data.message) data.message = "Request failed (" + res.status + ").";
        if (typeof data.ok !== "boolean") data.ok = res.ok;
        return data;
      });
    });
  }

  function payload(extra) {
    var out = {
      slug: CFG.slug,
      branchId: CFG.branchId || null,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.replace(/\\D/g, "").slice(-10),
      email: form.email.trim(),
      birthdate: form.birthdate,
      partySize: Number(form.partySize) || 2,
      tableNumber: CFG.tableNumber || null,
      captchaToken: null
    };
    if (extra) for (var k in extra) out[k] = extra[k];
    return out;
  }

  function partyOptions() {
    var html = "";
    for (var i = 1; i <= 12; i++) {
      html += '<option value="' + i + '"' + (Number(form.partySize) === i ? " selected" : "") + ">" + i + (i === 1 ? " person" : " people") + "</option>";
    }
    return html;
  }

  function otpBoxes() {
    var n = CFG.otpLength || 6;
    var html = '<div class="froq-so-otp" id="froq-so-otp">';
    for (var i = 0; i < n; i++) {
      html += '<input inputmode="numeric" maxlength="1" autocomplete="' + (i === 0 ? "one-time-code" : "off") + '" data-i="' + i + '" aria-label="Digit ' + (i + 1) + '" />';
    }
    html += "</div>";
    return html;
  }

  function render() {
    var title = document.getElementById("froq-so-title");
    var sub = document.getElementById("froq-so-sub");
    var body = document.getElementById("froq-so-body");
    var cta = document.getElementById("froq-so-cta");
    var back = document.getElementById("froq-so-back");
    if (!title || !sub || !body || !cta || !back) return;
    showError("");

    if (step === "form") {
      title.textContent = "Verify Your Details";
      sub.textContent = "We'll text a code to confirm your number.";
      body.innerHTML =
        '<form id="froq-so-form" autocomplete="on">' +
        '<div class="froq-so-row">' +
        '<div class="froq-so-field"><label for="froq-so-first">First name</label><input id="froq-so-first" name="given-name" autocomplete="given-name" maxlength="60" value="' + escAttr(form.firstName) + '" /></div>' +
        '<div class="froq-so-field"><label for="froq-so-last">Last name</label><input id="froq-so-last" name="family-name" autocomplete="family-name" maxlength="60" value="' + escAttr(form.lastName) + '" /></div>' +
        "</div>" +
        '<div class="froq-so-field"><label for="froq-so-phone">Phone</label><div class="froq-so-phone"><span>+91</span><input id="froq-so-phone" name="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98765 43210" value="' + escAttr(form.phone) + '" /></div></div>' +
        '<div class="froq-so-field"><label for="froq-so-email">Email</label><input id="froq-so-email" type="email" name="email" autocomplete="email" maxlength="120" value="' + escAttr(form.email) + '" /></div>' +
        '<div class="froq-so-row">' +
        '<div class="froq-so-field"><label for="froq-so-dob">Date of birth</label><input id="froq-so-dob" type="date" name="bday" autocomplete="bday" value="' + escAttr(form.birthdate) + '" /></div>' +
        '<div class="froq-so-field"><label for="froq-so-party">Table for</label><select id="froq-so-party">' + partyOptions() + "</select></div>" +
        "</div></form>";
      cta.textContent = busy ? "Sending…" : "Send OTP";
      cta.disabled = busy;
      back.classList.remove("is-on");
      return;
    }

    if (step === "otp") {
      title.textContent = "Enter OTP";
      sub.textContent = "We sent a " + (CFG.otpLength || 6) + "-digit code to +91 " + form.phone + ".";
      body.innerHTML = otpBoxes() +
        '<button type="button" id="froq-so-resend" style="display:block;width:100%;margin-top:8px;border:0;background:transparent;font:inherit;font-size:13px;font-weight:650;color:#5A6E62;cursor:pointer;"></button>';
      cta.textContent = busy ? "Verifying…" : "Verify & continue";
      cta.disabled = busy;
      back.classList.add("is-on");
      back.textContent = "Edit details";
      wireOtpInputs();
      updateResendLabel();
      return;
    }

    title.textContent = "You're in";
    sub.textContent = "Thanks! You're all set at " + (CFG.businessName || "this restaurant") + ".";
    body.innerHTML = "";
    cta.textContent = "Continue to menu";
    cta.disabled = false;
    back.classList.remove("is-on");
  }

  function escAttr(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function readForm() {
    var first = document.getElementById("froq-so-first");
    var last = document.getElementById("froq-so-last");
    var phone = document.getElementById("froq-so-phone");
    var email = document.getElementById("froq-so-email");
    var dob = document.getElementById("froq-so-dob");
    var party = document.getElementById("froq-so-party");
    if (first) form.firstName = first.value;
    if (last) form.lastName = last.value;
    if (phone) form.phone = phone.value.replace(/\\D/g, "").slice(-10);
    if (email) form.email = email.value;
    if (dob) form.birthdate = dob.value;
    if (party) form.partySize = Number(party.value) || 2;
  }

  function validateForm() {
    readForm();
    if (!form.firstName.trim()) return "Enter your first name.";
    if (!form.lastName.trim()) return "Enter your last name.";
    if (!/^\\d{10}$/.test(form.phone)) return "Enter a valid 10-digit mobile number.";
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email.trim())) return "Enter a valid email.";
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(form.birthdate)) return "Enter your date of birth.";
    var d = new Date(form.birthdate + "T00:00:00");
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1920 || d > new Date()) return "Enter a valid date of birth.";
    return null;
  }

  function readOtp() {
    var box = document.getElementById("froq-so-otp");
    if (!box) return "";
    var inputs = box.querySelectorAll("input");
    var code = "";
    for (var i = 0; i < inputs.length; i++) code += (inputs[i].value || "").replace(/\\D/g, "").slice(0, 1);
    form.otp = code;
    return code;
  }

  function wireOtpInputs() {
    var box = document.getElementById("froq-so-otp");
    if (!box) return;
    var inputs = Array.prototype.slice.call(box.querySelectorAll("input"));
    inputs.forEach(function (input, idx) {
      input.addEventListener("input", function () {
        var v = input.value.replace(/\\D/g, "").slice(-1);
        input.value = v;
        if (v && idx < inputs.length - 1) inputs[idx + 1].focus();
      });
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Backspace" && !input.value && idx > 0) inputs[idx - 1].focus();
      });
      input.addEventListener("paste", function (ev) {
        var text = (ev.clipboardData || window.clipboardData).getData("text") || "";
        var digits = text.replace(/\\D/g, "").slice(0, inputs.length);
        if (!digits) return;
        ev.preventDefault();
        for (var i = 0; i < inputs.length; i++) inputs[i].value = digits[i] || "";
        inputs[Math.min(digits.length, inputs.length) - 1].focus();
      });
    });
    if (inputs[0]) inputs[0].focus();
  }

  function startResendCountdown(seconds) {
    resendLeft = seconds || CFG.resendSeconds || 30;
    if (resendTimer) clearInterval(resendTimer);
    updateResendLabel();
    resendTimer = setInterval(function () {
      resendLeft -= 1;
      if (resendLeft <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
      updateResendLabel();
    }, 1000);
  }

  function updateResendLabel() {
    var btn = document.getElementById("froq-so-resend");
    if (!btn) return;
    if (resendLeft > 0) {
      btn.textContent = "Resend code in " + resendLeft + "s";
      btn.disabled = true;
    } else {
      btn.textContent = "Resend code";
      btn.disabled = false;
    }
  }

  async function sendOtp() {
    var err = validateForm();
    if (err) { showError(err); return; }
    busy = true;
    render();
    try {
      var result = await post("/api/menu/special-offers/send-otp", payload());
      if (!result.ok) {
        showError(result.message || "Couldn't send the code.");
        busy = false;
        render();
        return;
      }
      step = "otp";
      busy = false;
      startResendCountdown(result.resendSeconds || CFG.resendSeconds || 30);
      render();
    } catch (e) {
      showError("Network error. Check your connection.");
      busy = false;
      render();
    }
  }

  async function verifyOtp() {
    var code = readOtp();
    if (code.length !== (CFG.otpLength || 6)) {
      showError("Enter the " + (CFG.otpLength || 6) + "-digit code.");
      return;
    }
    busy = true;
    render();
    try {
      var result = await post("/api/menu/special-offers/verify", payload({ otp: code }));
      if (!result.ok) {
        showError(result.message || "Couldn't verify the code.");
        busy = false;
        render();
        return;
      }
      rememberDone();
      step = "done";
      busy = false;
      render();
    } catch (e) {
      showError("Network error. Check your connection.");
      busy = false;
      render();
    }
  }

  document.getElementById("froq-so-cta").addEventListener("click", function () {
    if (busy) return;
    if (step === "form") { void sendOtp(); return; }
    if (step === "otp") { void verifyOtp(); return; }
    closeSheet();
  });

  document.getElementById("froq-so-back").addEventListener("click", function () {
    if (busy || step !== "otp") return;
    step = "form";
    render();
  });

  root.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.id === "froq-so-resend" && !t.disabled && !busy) {
      void sendOtp();
    }
  });

  // Block Esc / backdrop dismiss — guests must complete verification.
  document.addEventListener("keydown", function (ev) {
    if (!root.classList.contains("is-open")) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);

  setTimeout(function () {
    openSheet();
  }, CFG.delayMs || 400);
})();
</script>`;
}
