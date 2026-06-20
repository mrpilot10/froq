"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Download, Share, SquarePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { enablePushForMerchant } from "@/lib/push/client";

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

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIPhoneOrPad = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ presents as desktop Safari; detect via touch + Mac platform.
  const isIPadOS =
    navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return isIPhoneOrPad || isIPadOS;
}

export function OnboardingPrompt() {
  const [open, setOpen] = useState(false);
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported">("default");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  useEffect(() => {
    const notifSupported = typeof window !== "undefined" && "Notification" in window;
    const currentNotif = notifSupported ? Notification.permission : "unsupported";
    const isInstalled = detectInstalled();
    const ios = detectIOS();

    setNotifState(currentNotif);
    setInstalled(isInstalled);
    setIsIOS(ios);
    // iOS has no install prompt API — surface the Add to Home Screen steps directly.
    if (ios && !isInstalled) setStepsOpen(true);

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
      toast.error("Notifications aren't supported on this browser.");
      return;
    }
    if (Notification.permission === "denied") {
      toast.error("Notifications are blocked. Enable them in your browser site settings.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifState(result);
      if (result === "granted") {
        const ok = await enablePushForMerchant();
        toast.success(ok ? "Notifications on. You'll get approval alerts." : "Notifications enabled.");
      } else if (result === "denied") {
        toast.error("Notifications are blocked. Enable them in your browser site settings.");
      }
    } catch {
      setNotifState("denied");
      toast.error("Couldn't enable notifications.");
    }
  };

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallEvent(null);
      return;
    }
    // No native prompt (iOS / unsupported) — reveal the manual steps.
    setStepsOpen((value) => !value);
  };

  const installActionLabel = installEvent ? "Install App" : stepsOpen ? "Hide" : "How?";

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
                    : isIOS
                      ? "Add Froq to your iPhone home screen"
                      : "Add Froq from your browser menu"}
              </div>
            </div>
            {installed ? (
              <span className="merchant-onboard-done">
                <Check size={16} strokeWidth={2.6} />
              </span>
            ) : (
              <button type="button" className="merchant-onboard-action" onClick={handleInstall}>
                {installActionLabel}
              </button>
            )}
          </div>

          {!installed && stepsOpen && (
            <div className="merchant-install-steps">
              <div className="merchant-install-steps-title">
                {isIOS ? "Install Froq on your iPhone" : "Install Froq"}
              </div>
              <ol className="merchant-install-steps-list">
                {isIOS ? (
                  <>
                    <li>
                      Tap the{" "}
                      <Share size={14} strokeWidth={2.4} className="merchant-install-step-icon" />{" "}
                      <strong>Share</strong> button in Safari.
                    </li>
                    <li>
                      Choose{" "}
                      <SquarePlus
                        size={14}
                        strokeWidth={2.4}
                        className="merchant-install-step-icon"
                      />{" "}
                      <strong>Add to Home Screen</strong>.
                    </li>
                    <li>
                      Tap <strong>Add</strong> in the top corner.
                    </li>
                  </>
                ) : (
                  <>
                    <li>Open your browser menu.</li>
                    <li>
                      Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                    </li>
                    <li>Confirm to install.</li>
                  </>
                )}
              </ol>
            </div>
          )}
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
