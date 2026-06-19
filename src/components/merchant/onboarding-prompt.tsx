"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Download, Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "froq-merchant-onboard-dismissed";

function detectInstalled() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export function OnboardingPrompt() {
  const [open, setOpen] = useState(false);
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported">("default");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const notifSupported = typeof window !== "undefined" && "Notification" in window;
    const currentNotif = notifSupported ? Notification.permission : "unsupported";
    const isInstalled = detectInstalled();

    setNotifState(currentNotif);
    setInstalled(isInstalled);

    const dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    const allDone = (currentNotif === "granted" || currentNotif === "unsupported") && isInstalled;

    if (!dismissed && !allDone) {
      const timer = window.setTimeout(() => setOpen(true), 700);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
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

  const notifDone = notifState === "granted" || notifState === "unsupported";

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

  const handleClose = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      labelledBy="onboard-title"
      className="merchant-theme"
    >
      <div className="merchant-onboard">
        <div className="merchant-onboard-head">
          <div className="merchant-onboard-badge">
            <Sparkles size={24} strokeWidth={2.2} />
          </div>
          <h3 id="onboard-title" className="merchant-onboard-title">
            Finish setting up Froq
          </h3>
          <p className="merchant-onboard-sub">
            Turn on alerts and install the app so you never miss a stamp approval or reward
            redemption.
          </p>
        </div>

        <div className="merchant-onboard-list">
          <div className="merchant-onboard-row">
            <div className="profile-row-icon">
              <Bell size={18} strokeWidth={2.2} />
            </div>
            <div className="merchant-onboard-copy">
              <div className="merchant-onboard-row-title">Enable notifications</div>
              <div className="merchant-onboard-row-sub">
                {notifState === "denied"
                  ? "Blocked — allow in browser settings"
                  : notifState === "unsupported"
                    ? "Not available on this device"
                    : "Real-time approval & reward alerts"}
              </div>
            </div>
            {notifDone ? (
              <span className="merchant-onboard-done">
                <Check size={16} strokeWidth={2.6} />
              </span>
            ) : (
              <button
                type="button"
                className="merchant-onboard-action"
                onClick={handleEnableNotifications}
              >
                Enable
              </button>
            )}
          </div>

          <div className="merchant-onboard-row">
            <div className="profile-row-icon">
              <Download size={18} strokeWidth={2.2} />
            </div>
            <div className="merchant-onboard-copy">
              <div className="merchant-onboard-row-title">Install app</div>
              <div className="merchant-onboard-row-sub">
                {installed
                  ? "Installed on this device"
                  : installEvent
                    ? "Add Froq to your home screen"
                    : "Use your browser menu → Add to Home Screen"}
              </div>
            </div>
            {installed ? (
              <span className="merchant-onboard-done">
                <Check size={16} strokeWidth={2.6} />
              </span>
            ) : (
              <button
                type="button"
                className="merchant-onboard-action"
                onClick={handleInstall}
                disabled={!installEvent}
              >
                Install
              </button>
            )}
          </div>
        </div>

        <button type="button" className="cta-btn merchant-cta-accent" onClick={handleClose}>
          {notifDone && installed ? "Done" : "Continue"}
        </button>
        <button type="button" className="merchant-onboard-later" onClick={handleClose}>
          Maybe later
        </button>
      </div>
    </BottomSheet>
  );
}
