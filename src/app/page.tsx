import type { Metadata } from "next";
import Script from "next/script";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Froq — Loyalty for local businesses",
  description:
    "Run digital stamps, rewards, and customer lifetime value from one dashboard. Built for shops, cafés, and local brands.",
};

export default function Home() {
  return (
    <>
      <LandingPage />
      <Script id="tawk-to" strategy="afterInteractive">
        {`
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src='https://embed.tawk.to/6a36d19e5143cb1d4702b3cb/1jrj25ku7';
s1.charset='UTF-8';
s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);
})();
        `}
      </Script>
    </>
  );
}
