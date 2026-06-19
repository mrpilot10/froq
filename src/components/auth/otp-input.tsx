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

  const handleChange = (index: number, digit: string) => {
    const cleaned = digit.replace(/\D/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = cleaned;
    updateValue(nextDigits);

    if (cleaned && index < length - 1) {
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
