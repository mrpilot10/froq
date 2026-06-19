"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, Download, Sparkles } from "lucide-react";
import { MERCHANT_PLAN } from "@/lib/merchant/constants";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectInstalled() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export function MerchantPlanCard() {
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported">("default");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const notifSupported = typeof window !== "undefined" && "Notification" in window;
    setNotifState(notifSupported ? Notification.permission : "unsupported");
    setInstalled(detectInstalled());

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const notifGranted = notifState === "granted";
  const notifBlocked = notifState === "denied";

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      setNotifState("unsupported");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifState(result);
    } catch {
      setNotifState("denied");
    }
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">Your plan</h3>

      <div className="panel-card merchant-plan-card">
        <div className="merchant-plan-head">
          <div className="merchant-plan-icon">
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="merchant-plan-copy">
            <span className="merchant-plan-eyebrow">Froq {MERCHANT_PLAN.name}</span>
            <div className="merchant-plan-price">
              {MERCHANT_PLAN.price}
              <span>{MERCHANT_PLAN.cycle}</span>
            </div>
          </div>
          <span className="merchant-plan-badge">{MERCHANT_PLAN.status}</span>
        </div>

        <ul className="merchant-plan-features">
          {MERCHANT_PLAN.features.map((feature) => (
            <li key={feature}>
              <Check size={15} strokeWidth={2.6} />
              {feature}
            </li>
          ))}
        </ul>

        <div className="merchant-plan-foot">
          <span className="merchant-plan-renew">Renews {MERCHANT_PLAN.renewsOn}</span>
          <button type="button" className="merchant-plan-manage">
            Manage plan
          </button>
        </div>
      </div>

      <div className="merchant-cta-pair">
        <button
          type="button"
          className={`merchant-app-cta${installed ? " is-done" : ""}`}
          onClick={handleInstall}
          disabled={installed || !installEvent}
        >
          <span className="merchant-app-cta-icon">
            {installed ? <Check size={18} strokeWidth={2.6} /> : <Download size={18} strokeWidth={2.2} />}
          </span>
          <span className="merchant-app-cta-copy">
            <span className="merchant-app-cta-title">
              {installed ? "App installed" : "Install app"}
            </span>
            <span className="merchant-app-cta-sub">
              {installed
                ? "On this device"
                : installEvent
                  ? "Add to home screen"
                  : "Use browser menu → Add to Home Screen"}
            </span>
          </span>
        </button>

        <button
          type="button"
          className={`merchant-app-cta${notifGranted ? " is-done" : ""}`}
          onClick={handleEnableNotifications}
          disabled={notifGranted || notifState === "unsupported"}
        >
          <span className="merchant-app-cta-icon">
            {notifGranted ? (
              <Check size={18} strokeWidth={2.6} />
            ) : (
              <BellRing size={18} strokeWidth={2.2} />
            )}
          </span>
          <span className="merchant-app-cta-copy">
            <span className="merchant-app-cta-title">
              {notifGranted ? "Notifications on" : "Enable notifications"}
            </span>
            <span className="merchant-app-cta-sub">
              {notifGranted
                ? "Alerts are active"
                : notifBlocked
                  ? "Blocked in browser settings"
                  : notifState === "unsupported"
                    ? "Not available here"
                    : "Approval & reward alerts"}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
