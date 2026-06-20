"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { DeviceSetupRows, detectInstalled, detectIOS, useDeviceSetup } from "./device-setup-rows";

const DISMISS_KEY = "froq-merchant-onboard-dismissed";

export function OnboardingPrompt() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const device = useDeviceSetup();
  const { installed, notifDone, allDone } = device;

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(wasDismissed);

    const currentNotif =
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported";
    const isDone = (currentNotif === "granted" || currentNotif === "unsupported") && detectInstalled();
    // iOS without install can't be auto-completed, but still avoid nagging if dismissed.
    void detectIOS();

    if (!wasDismissed && !isDone) {
      const timer = window.setTimeout(() => setOpen(true), 700);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
    setOpen(false);
  };

  const handleReopen = () => setOpen(true);

  // Persistent, in-flow top bar shown once the sheet is dismissed and steps remain.
  const barVisible = !allDone && dismissed && !open;
  const barMessage =
    !installed && !notifDone
      ? "Install the app and turn on notifications"
      : !installed
        ? "Install the app on this device"
        : "Turn on notifications";

  return (
    <>
      {barVisible && (
        <div className="merchant-setup-bar" role="region" aria-label="Finish setup">
          <div className="merchant-setup-bar-copy">
            <span className="merchant-setup-bar-title">Finish setup</span>
            <span className="merchant-setup-bar-sub">{barMessage} to get approval alerts.</span>
          </div>
          <button type="button" className="merchant-setup-bar-btn" onClick={handleReopen}>
            Set up
          </button>
        </div>
      )}
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

          <DeviceSetupRows state={device} />

          <button type="button" className="cta-btn merchant-cta-accent" onClick={handleClose}>
            {allDone ? "Done" : "Continue"}
          </button>
          <button type="button" className="merchant-onboard-later" onClick={handleClose}>
            Maybe later
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
