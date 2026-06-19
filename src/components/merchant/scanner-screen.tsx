"use client";

import { useState } from "react";
import { CheckCircle2, ScanLine } from "lucide-react";
import { VALID_REDEEM_CODES } from "@/lib/merchant/constants";

interface ScannerScreenProps {
  usedCodes: string[];
  onRedeem: (code: string, customerName: string, customerId: string) => void;
}

function parseRedeemCode(input: string) {
  const trimmed = input.trim().toUpperCase();
  const urlMatch = trimmed.match(/code=([A-Z0-9-]+)/i);
  return urlMatch ? urlMatch[1].toUpperCase() : trimmed;
}

export function ScannerScreen({ usedCodes, onRedeem }: ScannerScreenProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; code: string } | null>(null);

  const handleScan = () => {
    setError("");
    setSuccess(null);

    const parsed = parseRedeemCode(code);
    const match = VALID_REDEEM_CODES[parsed];

    if (!match || usedCodes.includes(parsed)) {
      setError("Invalid or already used reward code.");
      return;
    }

    onRedeem(parsed, match.customerName, match.customerId);
    setSuccess({ name: match.customerName, code: parsed });
    setCode("");
  };

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Scan reward</h2>
        <p className="tab-sub">Scan a customer&apos;s QR or enter their code</p>
      </div>

      <div className="panel-card merchant-scanner-card">
        <div className="merchant-scanner-frame" aria-hidden="true">
          <div className="merchant-scanner-corner tl" />
          <div className="merchant-scanner-corner tr" />
          <div className="merchant-scanner-corner bl" />
          <div className="merchant-scanner-corner br" />
          <ScanLine size={48} strokeWidth={1.8} className="merchant-scanner-icon" />
          <p className="merchant-scanner-hint">Point camera at customer QR</p>
        </div>

        <div className="merchant-scanner-divider">
          <span>or enter code manually</span>
        </div>

        <label className="auth-field">
          <span className="auth-label">Redemption code</span>
          <input
            className="auth-input merchant-code-input"
            type="text"
            placeholder="BLOOM-7Q4X9"
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

        <button type="button" className="cta-btn merchant-cta-accent" onClick={handleScan}>
          Mark as claimed
        </button>
      </div>

      <p className="merchant-scanner-note">
        Demo codes: <strong>BLOOM-7Q4X9</strong>, <strong>BLOOM-3K8M2</strong>
      </p>
    </div>
  );
}
