"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Download, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { enablePushForMerchant } from "@/lib/push/client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __froqInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function detectInstalled() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIPhoneOrPad = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ presents as desktop Safari; detect via touch + Mac platform.
  const isIPadOS =
    navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return isIPhoneOrPad || isIPadOS;
}

// On iOS, only Safari can "Add to Home Screen" into a push-capable PWA. Chrome,
// Firefox, etc. on iOS (and most in-app webviews) cannot.
export function detectIOSSafari() {
  if (!detectIOS()) return false;
  const ua = navigator.userAgent || "";
  const otherBrowser = /crios|fxios|edgios|opios|mercury|brave|duckduckgo/i.test(ua);
  return !otherBrowser;
}

export interface DeviceSetupState {
  notifState: NotificationPermission | "unsupported";
  installed: boolean;
  isIOS: boolean;
  iosSafari: boolean;
  /** iOS device that must install + open the PWA before notifications can work. */
  iosNeedsInstall: boolean;
  installEvent: BeforeInstallPromptEvent | null;
  stepsOpen: boolean;
  notifDone: boolean;
  allDone: boolean;
  installActionLabel: string;
  handleEnableNotifications: () => Promise<void>;
  handleInstall: () => Promise<void>;
}

export function useDeviceSetup(): DeviceSetupState {
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported">("default");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  useEffect(() => {
    const ios = detectIOS();
    setIsIOS(ios);
    setIosSafari(detectIOSSafari());

    // Re-evaluate install + notification state. Runs on mount and whenever the
    // user returns to the tab, so the prompt/top bar reflects a freshly installed
    // PWA or a permission change made elsewhere (e.g. in browser settings).
    const recheck = () => {
      const notifSupported = typeof window !== "undefined" && "Notification" in window;
      const currentNotif = notifSupported ? Notification.permission : "unsupported";
      const isInstalled = detectInstalled();
      // On iOS the Notification API only exists inside the installed PWA, so an
      // un-installed Safari tab reporting "unsupported" really means "install first".
      setNotifState(ios && !isInstalled ? "default" : currentNotif);
      setInstalled(isInstalled);
    };

    recheck();
    // iOS has no install prompt API — surface the Add to Home Screen steps directly.
    if (ios && !detectInstalled()) setStepsOpen(true);

    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", recheck);
    };
  }, []);

  // Best-effort: on Chromium, detect an already-installed PWA even from a tab.
  useEffect(() => {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<unknown[]>;
    };
    if (typeof nav.getInstalledRelatedApps !== "function") return;
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (apps.length > 0) setInstalled(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // The early-capture script in the document head may have already stored the
    // prompt before React mounted, so pick it up immediately.
    if (window.__froqInstallPrompt) setInstallEvent(window.__froqInstallPrompt);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleEarlyPrompt = () => {
      if (window.__froqInstallPrompt) setInstallEvent(window.__froqInstallPrompt);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      window.__froqInstallPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("froq:installprompt", handleEarlyPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("froq:installprompt", handleEarlyPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const iosNeedsInstall = isIOS && !installed;
  // On iOS, an un-installed device isn't "done" even if notifications report as
  // unsupported — the user still needs to install the PWA to receive any alerts.
  const notifDone = !iosNeedsInstall && (notifState === "granted" || notifState === "unsupported");
  const allDone = notifDone && installed;

  const handleEnableNotifications = async () => {
    // iOS web push only works from the installed home-screen app (iOS 16.4+).
    if (iosNeedsInstall) {
      setStepsOpen(true);
      toast.info(
        iosSafari
          ? "On iPhone: tap Share → Add to Home Screen, then open Froq from there to turn on alerts."
          : "On iPhone, open this page in Safari, add Froq to your Home Screen, then enable alerts from the installed app.",
      );
      return;
    }
    if (!("Notification" in window)) {
      setNotifState("unsupported");
      toast.error(
        isIOS
          ? "Update to iOS 16.4 or later to receive notifications."
          : "Notifications aren't supported on this browser.",
      );
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
      window.__froqInstallPrompt = null;
      return;
    }
    // No native prompt (iOS / unsupported) — reveal the manual steps.
    setStepsOpen((value) => !value);
  };

  const installActionLabel = installEvent ? "Install App" : stepsOpen ? "Hide" : "How?";

  return {
    notifState,
    installed,
    isIOS,
    iosSafari,
    iosNeedsInstall,
    installEvent,
    stepsOpen,
    notifDone,
    allDone,
    installActionLabel,
    handleEnableNotifications,
    handleInstall,
  };
}

export function DeviceSetupRows({ state }: { state: DeviceSetupState }) {
  const {
    notifState,
    installed,
    isIOS,
    iosSafari,
    iosNeedsInstall,
    installEvent,
    stepsOpen,
    notifDone,
    installActionLabel,
    handleEnableNotifications,
    handleInstall,
  } = state;

  const notifSubText =
    notifState === "denied"
      ? "Blocked — allow in browser settings"
      : notifState === "unsupported"
        ? isIOS
          ? "Needs iOS 16.4+ in the installed app"
          : "Not available on this device"
        : iosNeedsInstall
          ? "Install Froq first, then open it to enable"
          : "Real-time approval & reward alerts";

  return (
    <div className="merchant-onboard-list">
      <div className="merchant-onboard-row">
        <div className="profile-row-icon">
          <Bell size={18} strokeWidth={2.2} />
        </div>
        <div className="merchant-onboard-copy">
          <div className="merchant-onboard-row-title">Enable notifications</div>
          <div className="merchant-onboard-row-sub">{notifSubText}</div>
        </div>
        {notifDone ? (
          <span className="merchant-onboard-done">
            <Check size={16} strokeWidth={2.6} />
          </span>
        ) : (
          <button
            type="button"
            className="merchant-onboard-action"
            onClick={() => void handleEnableNotifications()}
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
          <button
            type="button"
            className="merchant-onboard-action"
            onClick={() => void handleInstall()}
          >
            {installActionLabel}
          </button>
        )}
      </div>

      {!installed && stepsOpen && (
        <div className="merchant-install-steps">
          <div className="merchant-install-steps-title">
            {isIOS ? "Add Froq to your Home Screen" : "Install Froq"}
          </div>
          {isIOS && !iosSafari && (
            <p className="merchant-install-steps-note">
              Open <strong>froq.io</strong> in <strong>Safari</strong> first — other iPhone browsers
              can&apos;t install web apps or receive notifications.
            </p>
          )}
          <ol className="install-steps">
            {isIOS ? (
              <>
                <li className="install-step">
                  <span className="install-step-num">1</span>
                  <span className="install-step-text">
                    Tap the{" "}
                    <span className="install-step-chip">
                      <Share size={13} strokeWidth={2.4} />
                      Share
                    </span>{" "}
                    button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="install-step">
                  <span className="install-step-num">2</span>
                  <span className="install-step-text">
                    Scroll down and choose{" "}
                    <span className="install-step-chip">
                      <SquarePlus size={13} strokeWidth={2.4} />
                      Add to Home Screen
                    </span>
                    .
                  </span>
                </li>
                <li className="install-step">
                  <span className="install-step-num">3</span>
                  <span className="install-step-text">
                    Tap <strong>Add</strong>, then open Froq from your Home Screen.
                  </span>
                </li>
              </>
            ) : (
              <>
                <li className="install-step">
                  <span className="install-step-num">1</span>
                  <span className="install-step-text">Open your browser menu.</span>
                </li>
                <li className="install-step">
                  <span className="install-step-num">2</span>
                  <span className="install-step-text">
                    Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </span>
                </li>
                <li className="install-step">
                  <span className="install-step-num">3</span>
                  <span className="install-step-text">Confirm to install.</span>
                </li>
              </>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}
