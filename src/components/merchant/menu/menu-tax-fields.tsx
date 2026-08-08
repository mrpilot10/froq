"use client";

import {
  formatTaxPercent,
  hasMenuCharges,
  menuTaxBreakdown,
  normalizeTaxPercent,
  type MenuTaxRates,
} from "@/lib/menu/tax";

interface MenuTaxFieldsProps {
  value: MenuTaxRates;
  onChange: (next: MenuTaxRates) => void;
  disabled?: boolean;
}

/** Enough to read a percent off at a glance without doing arithmetic. */
const PREVIEW_SUBTOTAL = 1000;

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * CGST, SGST and service charge for AI Menu carts. Shared by Menu settings and
 * onboarding so a merchant is asked the same three questions in the same words
 * whichever door they came in through.
 */
export function MenuTaxFields({ value, onChange, disabled }: MenuTaxFieldsProps) {
  const preview = menuTaxBreakdown(PREVIEW_SUBTOTAL, value);
  const patch = (next: Partial<MenuTaxRates>) => onChange({ ...value, ...next });

  const field = (
    label: string,
    key: keyof MenuTaxRates,
    hint: string,
  ) => (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      <input
        className="auth-input"
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        // Half points are the common GST rates here, so the arrows land on them.
        step={0.5}
        value={formatTaxPercent(value[key])}
        disabled={disabled}
        onChange={(e) => patch({ [key]: normalizeTaxPercent(e.target.value) })}
      />
      <span className="merchant-field-hint">{hint}</span>
    </label>
  );

  return (
    <>
      {field("CGST %", "cgstPercent", "Central GST on the bill. Set 0 to leave it off.")}
      {field("SGST %", "sgstPercent", "State GST on the bill. Usually the same as CGST.")}
      {field(
        "Service charge %",
        "serviceChargePercent",
        "Optional, and you must waive it if a guest asks. Set 0 to not charge it.",
      )}

      <div className="merchant-field-hint" style={{ display: "block" }}>
        {hasMenuCharges(value) ? (
          <>
            A {inr(PREVIEW_SUBTOTAL)} order bills{" "}
            <strong>{inr(preview.total)}</strong>
            {" — "}
            {[
              preview.cgst > 0 ? `CGST ${inr(preview.cgst)}` : null,
              preview.sgst > 0 ? `SGST ${inr(preview.sgst)}` : null,
              preview.serviceCharge > 0 ? `service ${inr(preview.serviceCharge)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </>
        ) : (
          <>
            Guests are shown menu prices only — no tax or service charge is added
            to the cart.
          </>
        )}
      </div>
    </>
  );
}
