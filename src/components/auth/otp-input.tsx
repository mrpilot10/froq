"use client";

import { useEffect, useRef, type ChangeEvent, type ClipboardEvent } from "react";

interface OtpInputProps {
  value: string;
  length?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function digitsOnly(raw: string, length: number) {
  return raw.replace(/\D/g, "").slice(0, length);
}

// A single underlying input drives the value so iOS/Android SMS auto-fill and
// "one-time-code" suggestions populate the entire code at once (multiple
// maxLength=1 boxes only ever receive a single digit on iOS). The boxes below
// are purely presentational and sit under the transparent input.
export function OtpInput({
  value,
  length = 6,
  disabled = false,
  onChange,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");
  const activeIndex = Math.min(value.length, length - 1);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(digitsOnly(event.target.value, length));
  };

  // Mobile long-press paste must be handled explicitly — some WebViews drop
  // multi-digit paste into controlled inputs without firing a usable onChange.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData?.getData("text") ?? "";
    const cleaned = digitsOnly(text, length);
    if (!cleaned) return;
    event.preventDefault();
    onChange(cleaned);
  };

  return (
    <div
      className="auth-otp"
      role="group"
      aria-label="One-time password"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="auth-otp-field"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name="one-time-code"
        maxLength={length}
        value={value}
        disabled={disabled}
        aria-label="Enter the verification code"
        onChange={handleChange}
        onPaste={handlePaste}
      />
      <div className="auth-otp-row" aria-hidden>
        {digits.map((digit, index) => (
          <div
            key={index}
            className={`auth-otp-digit${
              !disabled && index === activeIndex && value.length < length ? " is-active" : ""
            }${digit ? " is-filled" : ""}`}
          >
            {digit}
          </div>
        ))}
      </div>
    </div>
  );
}
