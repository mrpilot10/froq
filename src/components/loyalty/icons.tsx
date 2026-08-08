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

export function WhatsAppIcon({
  size = 24,
  color = "var(--brand)",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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
