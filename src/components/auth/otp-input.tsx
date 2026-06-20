"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

interface OtpInputProps {
  value: string;
  length?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function OtpInput({
  value,
  length = 6,
  disabled = false,
  onChange,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  const focusInput = useCallback((index: number) => {
    inputsRef.current[index]?.focus();
  }, []);

  useEffect(() => {
    if (!disabled) focusInput(0);
  }, [disabled, focusInput]);

  const updateValue = useCallback(
    (nextDigits: string[]) => {
      onChange(nextDigits.join("").slice(0, length));
    },
    [length, onChange],
  );

  const handleChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");

    // SMS auto-fill (and paste) deliver the whole code into a single box — spread
    // the characters across the inputs starting from the current one.
    if (cleaned.length > 1) {
      const nextDigits = [...digits];
      for (let offset = 0; offset < cleaned.length && index + offset < length; offset += 1) {
        nextDigits[index + offset] = cleaned[offset];
      }
      updateValue(nextDigits);
      focusInput(Math.min(index + cleaned.length, length - 1));
      return;
    }

    const single = cleaned.slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = single;
    updateValue(nextDigits);

    if (single && index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;

    const nextDigits = Array.from({ length }, (_, index) => pasted[index] ?? "");
    updateValue(nextDigits);

    const focusIndex = Math.min(pasted.length, length - 1);
    focusInput(focusIndex);
  };

  return (
    <div className="auth-otp-row" role="group" aria-label="One-time password">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          className="auth-otp-digit"
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}
