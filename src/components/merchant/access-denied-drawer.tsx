"use client";

import { AlertTriangle } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";

interface AccessDeniedDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AccessDeniedDrawer({ open, onClose }: AccessDeniedDrawerProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="access-denied-title"
      className="merchant-theme"
    >
      <div className="merchant-access-denied">
        <div className="merchant-access-denied-icon" aria-hidden>
          <AlertTriangle size={28} strokeWidth={2.1} />
        </div>
        <h3 id="access-denied-title" className="merchant-access-denied-title">
          You do not have access to this page
        </h3>
        <p className="merchant-access-denied-sub">
          If you need assistance, contact your manager.
        </p>
        <button type="button" className="cta-btn merchant-cta-accent" onClick={onClose}>
          Okay
        </button>
      </div>
    </BottomSheet>
  );
}
