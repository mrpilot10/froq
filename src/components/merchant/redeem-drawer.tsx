"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PartyPopper, ScanLine } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { parseRedeemCode } from "@/lib/merchant/parse-redeem-code";
import { useQrScanner } from "@/lib/merchant/use-qr-scanner";

interface RedeemResult {
  ok: boolean;
  error?: string;
  customerName?: string;
}

interface RedeemDrawerProps {
  open: boolean;
  onClose: () => void;
  onRedeem: (code: string) => Promise<RedeemResult>;
}

const CODE_PREFIX = "FROQ-";

export function RedeemDrawer({ open, onClose, onRedeem }: RedeemDrawerProps) {
  const [code, setCode] = useState(CODE_PREFIX);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ name: string; code: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scannedRef = useRef(false);

  const reset = useCallback(() => {
    setCode(CODE_PREFIX);
    setError("");
    setSubmitting(false);
    setSuccess(null);
    setCameraOpen(false);
    scannedRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setCameraOpen(true);
  }, [open, reset]);

  const redeemCode = useCallback(
    async (raw: string) => {
      const value = parseRedeemCode(raw);
      if (!value) {
        setError("Enter the reward code shown on the customer's card.");
        return;
      }
      setError("");
      setSubmitting(true);
      const res = await onRedeem(value);
      setSubmitting(false);

      if (!res.ok) {
        setError(res.error ?? "Invalid or already used reward code.");
        scannedRef.current = false;
        return;
      }

      setSuccess({ name: res.customerName ?? "Customer", code: value });
      setCode(CODE_PREFIX);
      setCameraOpen(false);
      scannedRef.current = false;
    },
    [onRedeem],
  );

  const handleScanResult = useCallback(
    (payload: string) => {
      if (submitting || scannedRef.current) return;
      scannedRef.current = true;
      const parsed = parseRedeemCode(payload);
      setCode(parsed);
      void redeemCode(payload);
    },
    [redeemCode, submitting],
  );

  const { videoRef, canvasRef, cameraError, startCamera } = useQrScanner({
    active: open && cameraOpen && success === null,
    onScan: handleScanResult,
  });

  const handleOpenCamera = () => {
    scannedRef.current = false;
    setError("");
    setSuccess(null);
    setCameraOpen(true);
    void startCamera();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      labelledBy="redeem-drawer-title"
      className="merchant-theme merchant-redeem-drawer"
    >
      {success ? (
        <div className="merchant-redeem-success" role="status">
          <div className="merchant-claimed-badge" aria-hidden="true">
            <PartyPopper size={40} strokeWidth={2} />
          </div>
          <h3 id="redeem-drawer-title" className="merchant-claimed-title">
            Reward claimed!
          </h3>
          <p className="merchant-claimed-sub">
            <strong>{success.name}</strong> just redeemed their reward. Hand it over and
            they&apos;ll start a fresh card.
          </p>
          <div className="merchant-claimed-code">{success.code}</div>
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            onClick={() => {
              setSuccess(null);
              handleOpenCamera();
            }}
          >
            Scan another reward
          </button>
          <button type="button" className="merchant-link-btn" onClick={handleClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="merchant-redeem-sheet">
          <div className="merchant-redeem-sheet-head">
            <h3 id="redeem-drawer-title" className="merchant-redeem-sheet-title">
              Redeem reward
            </h3>
            <p className="merchant-redeem-sheet-sub">
              Scan the customer&apos;s QR or enter their FROQ code
            </p>
          </div>

          {submitting ? (
            <div className="merchant-scanner-loading" aria-busy="true" role="status">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="merchant-scanner-loading-title">Redeeming reward…</p>
              <p className="merchant-scanner-loading-sub">Updating the customer&apos;s card.</p>
            </div>
          ) : (
            <div className="merchant-scanner-layout merchant-scanner-layout--sheet">
              <div className="merchant-scanner-col merchant-scanner-col--camera">
                <button
                  type="button"
                  className="merchant-scanner-frame"
                  onClick={handleOpenCamera}
                  disabled={submitting}
                  aria-label="Open camera to scan customer QR code"
                >
                  {cameraOpen ? (
                    <>
                      <video
                        ref={videoRef}
                        className="merchant-scanner-video"
                        playsInline
                        muted
                      />
                      <canvas
                        ref={canvasRef}
                        className="merchant-scanner-canvas"
                        aria-hidden="true"
                      />
                      <div className="merchant-scanner-overlay">
                        <div className="merchant-scanner-corner tl" />
                        <div className="merchant-scanner-corner tr" />
                        <div className="merchant-scanner-corner bl" />
                        <div className="merchant-scanner-corner br" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="merchant-scanner-corner tl" />
                      <div className="merchant-scanner-corner tr" />
                      <div className="merchant-scanner-corner bl" />
                      <div className="merchant-scanner-corner br" />
                      <ScanLine size={40} strokeWidth={1.8} className="merchant-scanner-icon" />
                      <p className="merchant-scanner-hint">Tap to open camera</p>
                    </>
                  )}
                </button>
                {cameraError ? (
                  <p className="auth-error" role="alert">
                    {cameraError}
                  </p>
                ) : null}
              </div>

              <div className="merchant-scanner-divider" aria-hidden="true">
                <span>or</span>
              </div>

              <div className="merchant-scanner-col merchant-scanner-col--manual">
                <label className="auth-field">
                  <span className="auth-label">Redemption code</span>
                  <input
                    className="auth-input merchant-code-input"
                    type="text"
                    placeholder="FROQ-XXXXX"
                    value={code}
                    disabled={submitting}
                    onChange={(event) => {
                      const raw = event.target.value.toUpperCase();
                      const suffix = raw.startsWith(CODE_PREFIX)
                        ? raw.slice(CODE_PREFIX.length)
                        : raw.replace(/^F?R?O?Q?-?/, "");
                      setCode(CODE_PREFIX + suffix);
                      setError("");
                    }}
                  />
                </label>

                {error ? (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="cta-btn merchant-cta-accent"
                  disabled={submitting}
                  onClick={() => void redeemCode(code)}
                >
                  Mark as claimed
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
