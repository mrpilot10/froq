import Script from "next/script";

/** Tawk.to live chat widget for the public marketing pages. */
export function SupportChat() {
  return (
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
  );
}
