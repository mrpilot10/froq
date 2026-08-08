import Script from "next/script";

/**
 * GA4 / Google tag (gtag.js). Measurement ID from env — no-op when unset.
 * Loads on all public pages via the root layout.
 */
export function Ga4SiteTag() {
  const id =
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ||
    process.env.GA4_MEASUREMENT_ID?.trim() ||
    "";

  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-gtag" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${id}', { send_page_view: true });
      `}</Script>
    </>
  );
}

export function ga4MeasurementId(): string | null {
  const id =
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ||
    process.env.GA4_MEASUREMENT_ID?.trim() ||
    null;
  return id && /^G-[A-Z0-9]+$/i.test(id) ? id : null;
}
