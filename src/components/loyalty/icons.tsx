export function CoffeeIcon({ stroke = "var(--brand)" }: { stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 9h13a3 3 0 0 1 0 6h-1"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 9v6.5A2.5 2.5 0 0 0 6.5 18h6A2.5 2.5 0 0 0 15 15.5V9"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 4.5c.5 1-1 1.5-.5 3M9.5 4.5c.5 1-1 1.5-.5 3"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5.5"
        stroke="var(--brand)"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="4" stroke="var(--brand)" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="var(--brand)" />
    </svg>
  );
}

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"
        stroke="var(--brand)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 9.3c.3 2.7 2.7 5.1 5.4 5.4.9.1 1.1-.6 1.1-1l-.1-1.1-2-0.5-.6.8a5.3 5.3 0 0 1-2.4-2.4l.8-.6-.5-2-1.1-.1c-.4 0-1.1.2-1 1.1z"
        fill="var(--brand)"
      />
    </svg>
  );
}

export function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--brand)" strokeWidth="1.6" />
      <path
        d="M13.8 8.4h1.3V6.2h-1.6c-1.6 0-2.6 1-2.6 2.6v1.4H9.5v2.3h1.4V18h2.3v-5.5h1.6l.3-2.3h-1.9V9c0-.4.2-.6.6-.6z"
        fill="var(--brand)"
      />
    </svg>
  );
}

export function WebsiteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--brand)" strokeWidth="1.6" />
      <path
        d="M3 12h18M12 3c2.3 2.5 3.5 5.8 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.8-3.5-9s1.2-6.5 3.5-9z"
        stroke="var(--brand)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M21 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.1c-.2 1.2-.9 2.2-2 2.9v2.4h3.2c1.9-1.7 3-4.3 3-7.2z"
        fill="var(--brand)"
      />
      <path
        d="M12 21c2.6 0 4.8-.9 6.3-2.4l-3.2-2.4c-.9.6-2 .9-3.1.9-2.4 0-4.4-1.6-5.1-3.7H3v2.5A9 9 0 0 0 12 21z"
        fill="var(--brand)"
        opacity=".75"
      />
      <path
        d="M6.9 13.05a5.4 5.4 0 0 1 0-3.4V7.15H3.6a9 9 0 0 0 0 8.1l3.3-2.2z"
        fill="var(--brand)"
        opacity=".55"
      />
      <path
        d="M12 6.35c1.4 0 2.7.5 3.7 1.4l2.8-2.7C16.8 3.45 14.6 2.75 12 2.75a9 9 0 0 0-8.4 5.4l3.3 2.6c.7-2.1 2.7-3.7 5.1-3.7z"
        fill="var(--brand)"
        opacity=".9"
      />
    </svg>
  );
}
