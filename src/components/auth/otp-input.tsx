"use client";

import { useEffect, useRef, type ChangeEvent } from "react";

interface OtpInputProps {
  value: string;
  length?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
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
    const cleaned = event.target.value.replace(/\D/g, "").slice(0, length);
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
        autoComplete="one-time-code"
        name="otp"
        maxLength={length}
        value={value}
        disabled={disabled}
        aria-label="Enter the verification code"
        onChange={handleChange}
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
