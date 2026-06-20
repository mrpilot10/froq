"use client";

import { Download, Loader2, RefreshCw } from "lucide-react";
import { useMerchantPoster } from "./use-merchant-poster";

interface MerchantPosterCardProps {
  caption?: string;
}

export function MerchantPosterCard({ caption }: MerchantPosterCardProps) {
  const { posterUrl, isLoading, error, download, reload } = useMerchantPoster();

  return (
    <div className="merchant-poster-card">
      {caption ? <p className="merchant-qr-caption">{caption}</p> : null}

      <div className="merchant-poster-preview">
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="merchant-poster-img" src={posterUrl} alt="QR poster preview" />
        ) : error ? (
          <div className="merchant-poster-state">
            <p className="merchant-poster-error">{error}</p>
            <button type="button" className="merchant-poster-retry" onClick={() => void reload()}>
              <RefreshCw size={14} strokeWidth={2.4} />
              Retry
            </button>
          </div>
        ) : (
          <div className="merchant-poster-state" aria-live="polite">
            <Loader2 size={22} strokeWidth={2.2} className="merchant-poster-spinner" />
            <span className="merchant-poster-loading-text">Generating poster…</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className="cta-btn merchant-cta-accent merchant-qr-download"
        onClick={download}
        disabled={!posterUrl || isLoading}
      >
        <Download size={17} strokeWidth={2.3} />
        Download QR Poster
      </button>
    </div>
  );
}
