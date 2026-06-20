"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ScanLine } from "lucide-react";
import { parseRedeemCode } from "@/lib/merchant/parse-redeem-code";
import { useQrScanner } from "@/lib/merchant/use-qr-scanner";

interface RedeemResult {
  ok: boolean;
  error?: string;
  customerName?: string;
}

interface ScannerScreenProps {
  onRedeem: (code: string) => Promise<RedeemResult>;
}

export function ScannerScreen({ onRedeem }: ScannerScreenProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ name: string; code: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scannedRef = useRef(false);

  const redeemCode = useCallback(
    async (raw: string) => {
      const value = parseRedeemCode(raw);
      if (!value) {
        setError("Enter the reward code shown on the customer's card.");
        return;
      }
      setError("");
      setSuccess(null);
      setSubmitting(true);
      const res = await onRedeem(value);
      setSubmitting(false);

      if (!res.ok) {
        setError(res.error ?? "Invalid or already used reward code.");
        scannedRef.current = false;
        return;
      }

      setSuccess({ name: res.customerName ?? "Customer", code: value });
      setCode("");
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
    active: cameraOpen,
    onScan: handleScanResult,
  });

  useEffect(() => {
    setCameraOpen(true);
  }, []);

  const handleOpenCamera = () => {
    scannedRef.current = false;
    setError("");
    setSuccess(null);
    setCameraOpen(true);
    void startCamera();
  };

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Scan reward</h2>
        <p className="tab-sub">Scan a customer&apos;s QR or enter their code</p>
      </div>

      <div className="panel-card merchant-scanner-card">
        <button
          type="button"
          className="merchant-scanner-frame"
          onClick={handleOpenCamera}
          aria-label="Open camera to scan customer QR code"
        >
          {cameraOpen ? (
            <>
              <video ref={videoRef} className="merchant-scanner-video" playsInline muted />
              <canvas ref={canvasRef} className="merchant-scanner-canvas" aria-hidden="true" />
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
              <ScanLine size={48} strokeWidth={1.8} className="merchant-scanner-icon" />
              <p className="merchant-scanner-hint">Tap to open camera</p>
            </>
          )}
        </button>

        {cameraError && (
          <p className="auth-error" role="alert">
            {cameraError}
          </p>
        )}

        {cameraOpen && submitting && (
          <p className="merchant-scanner-scanning" role="status">
            Scanning…
          </p>
        )}

        <div className="merchant-scanner-divider">
          <span>or enter code manually</span>
        </div>

        <label className="auth-field">
          <span className="auth-label">Redemption code</span>
          <input
            className="auth-input merchant-code-input"
            type="text"
            placeholder="FROQ-XXXXX"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setError("");
              setSuccess(null);
            }}
          />
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <div className="merchant-scan-success" role="status">
            <CheckCircle2 size={20} strokeWidth={2.2} />
            <div>
              <div className="merchant-scan-success-title">Reward marked as claimed</div>
              <div className="merchant-scan-success-sub">
                {success.name} · {success.code}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          className="cta-btn merchant-cta-accent"
          disabled={submitting}
          onClick={() => void redeemCode(code)}
        >
          {submitting ? "Redeeming…" : "Mark as claimed"}
        </button>
      </div>

      <p className="merchant-scanner-note">
        Ask the customer to open their reward and show the QR, or read out the{" "}
        <strong>FROQ-</strong> code.
      </p>
    </div>
  );
}
