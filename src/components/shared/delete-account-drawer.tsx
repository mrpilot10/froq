"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";

interface DeleteAccountDrawerProps {
  open: boolean;
  accountName: string;
  title?: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}

export function DeleteAccountDrawer({
  open,
  accountName,
  title = "Delete account",
  description,
  confirmLabel = "Delete account",
  onClose,
  onConfirm,
}: DeleteAccountDrawerProps) {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const expected = accountName.trim().toUpperCase();
  const matches = confirmText.trim().toUpperCase() === expected && expected.length > 0;

  const handleClose = () => {
    setConfirmText("");
    setError("");
    onClose();
  };

  const handleDelete = async () => {
    if (!matches) {
      setError(`Type ${expected} to confirm.`);
      return;
    }
    setError("");
    setSubmitting(true);
    const res = await onConfirm();
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Could not delete your account.");
      return;
    }
    handleClose();
  };

  return (
    <BottomSheet open={open} onClose={handleClose} labelledBy="delete-account-title" className="merchant-theme">
      <div className="delete-account-sheet">
        <div className="delete-account-head">
          <div className="delete-account-badge" aria-hidden="true">
            <AlertTriangle size={22} strokeWidth={2.2} />
          </div>
          <h3 id="delete-account-title" className="delete-account-title">
            {title}
          </h3>
          <p className="delete-account-sub">{description}</p>
        </div>

        <label className="auth-field">
          <span className="auth-label">
            Type <strong>{expected}</strong> to confirm
          </span>
          <input
            className="auth-input delete-account-input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={expected}
            value={confirmText}
            onChange={(event) => {
              setConfirmText(event.target.value);
              setError("");
            }}
          />
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="cta-btn delete-account-btn"
          disabled={!matches || submitting}
          onClick={() => void handleDelete()}
        >
          {submitting ? "Deleting…" : confirmLabel}
        </button>
        <button type="button" className="merchant-onboard-later" onClick={handleClose}>
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
