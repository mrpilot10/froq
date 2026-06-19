"use client";

import { useRef, type ChangeEvent } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { BRAND_COLORS, FIELD_LIMITS } from "@/lib/merchant/constants";
import type { MerchantEditSection, MerchantProfile } from "@/lib/merchant/types";

interface MerchantProfileEditScreenProps {
  section: MerchantEditSection;
  profile: MerchantProfile;
  onChange: (profile: MerchantProfile) => void;
  onClose: () => void;
  onSave: () => void;
}

const SECTION_META: Record<
  Exclude<MerchantEditSection, null>,
  { title: string; subtitle: string }
> = {
  business: {
    title: "Store details",
    subtitle: "Logo, business name, and location",
  },
  links: {
    title: "Links & social",
    subtitle: "Google Business, website, and socials",
  },
  loyalty: {
    title: "Rewards & stamps",
    subtitle: "Configure your loyalty offer",
  },
  notifications: {
    title: "Alerts & email",
    subtitle: "Choose what you get notified about",
  },
  account: {
    title: "Account settings",
    subtitle: "Login and contact preferences",
  },
};

interface LimitedFieldProps {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: "text" | "url" | "email" | "tel";
}

function LimitedField({
  label,
  value,
  maxLength,
  onChange,
  type = "text",
  placeholder,
  hint,
  inputMode,
}: LimitedFieldProps) {
  return (
    <label className="auth-field">
      <span className="merchant-field-head">
        <span className="auth-label">{label}</span>
        <span className="merchant-char-count">
          {value.length}/{maxLength}
        </span>
      </span>
      <input
        className="auth-input"
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <span className="merchant-field-hint">{hint}</span>}
    </label>
  );
}

interface PlainFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "url" | "email" | "tel";
}

function PlainField({ label, value, onChange, type = "text", placeholder, inputMode }: PlainFieldProps) {
  return (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      <input
        className="auth-input"
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function MerchantProfileEditScreen({
  section,
  profile,
  onChange,
  onClose,
  onSave,
}: MerchantProfileEditScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const meta = section ? SECTION_META[section] : null;

  function updateField<K extends keyof MerchantProfile>(key: K, value: MerchantProfile[K]) {
    onChange({ ...profile, [key]: value });
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateField("logoDataUrl", reader.result as string);
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <BottomSheet
      open={section !== null}
      onClose={onClose}
      labelledBy="merchant-edit-title"
      className="merchant-theme merchant-edit-drawer"
    >
      {section && meta && (
        <div className="merchant-edit-sheet">
          <div className="merchant-edit-sheet-head">
            <h3 id="merchant-edit-title" className="merchant-edit-sheet-title">
              {meta.title}
            </h3>
            <p className="merchant-edit-sheet-sub">{meta.subtitle}</p>
          </div>

          <div className="merchant-edit-fields">
            {section === "business" && (
          <>
            <div className="merchant-logo-field">
              <span className="auth-label">Business logo</span>
              <div className="merchant-logo-upload">
                <div className="merchant-logo-preview">
                  {profile.logoDataUrl ? (
                    <Image
                      src={profile.logoDataUrl}
                      alt="Business logo"
                      width={64}
                      height={64}
                      unoptimized
                    />
                  ) : (
                    <ImagePlus size={22} strokeWidth={2} />
                  )}
                </div>
                <div className="merchant-logo-actions">
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--reject"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {profile.logoDataUrl ? "Replace" : "Upload"}
                  </button>
                  {profile.logoDataUrl && (
                    <button
                      type="button"
                      className="merchant-logo-remove"
                      onClick={() => updateField("logoDataUrl", undefined)}
                      aria-label="Remove logo"
                    >
                      <Trash2 size={16} strokeWidth={2.3} />
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="merchant-file-input"
                  onChange={handleLogoUpload}
                />
              </div>
              <span className="merchant-field-hint">PNG, JPG, or SVG. Square works best.</span>
            </div>

            <div className="merchant-color-field">
              <span className="auth-label">Brand color</span>
              <div className="merchant-color-grid" role="radiogroup" aria-label="Brand color">
                {BRAND_COLORS.map((color) => {
                  const isSelected = profile.brandColor === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={color.name}
                      title={color.name}
                      className={`merchant-color-swatch${isSelected ? " selected" : ""}`}
                      style={{ background: color.value }}
                      onClick={() => updateField("brandColor", color.value)}
                    >
                      {isSelected && <Check size={16} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              <span className="merchant-field-hint">Used on your customer loyalty card.</span>
            </div>

            <LimitedField
              label="Business name"
              value={profile.businessName}
              maxLength={FIELD_LIMITS.businessName}
              onChange={(v) => updateField("businessName", v)}
            />
            <LimitedField
              label="Short name"
              value={profile.shortName}
              maxLength={FIELD_LIMITS.shortName}
              onChange={(v) => updateField("shortName", v)}
            />
            <LimitedField
              label="Address"
              value={profile.address}
              maxLength={FIELD_LIMITS.address}
              onChange={(v) => updateField("address", v)}
            />
          </>
        )}

        {section === "links" && (
          <>
            <PlainField
              label="Google Business"
              value={profile.googleBusinessUrl}
              onChange={(v) => updateField("googleBusinessUrl", v)}
              placeholder="g.page/your-business"
            />
            <PlainField
              label="Website"
              value={profile.websiteUrl}
              onChange={(v) => updateField("websiteUrl", v)}
              placeholder="yourbusiness.com"
            />
            <PlainField
              label="Instagram"
              value={profile.instagramUrl}
              onChange={(v) => updateField("instagramUrl", v)}
              placeholder="instagram.com/handle"
            />
            <PlainField
              label="Facebook"
              value={profile.facebookUrl}
              onChange={(v) => updateField("facebookUrl", v)}
              placeholder="facebook.com/page"
            />
            <PlainField
              label="X (Twitter)"
              value={profile.xUrl}
              onChange={(v) => updateField("xUrl", v)}
              placeholder="x.com/handle"
            />
          </>
        )}

        {section === "loyalty" && (
          <>
            <LimitedField
              label="Offer title"
              value={profile.rewardTitle}
              maxLength={FIELD_LIMITS.rewardTitle}
              onChange={(v) => updateField("rewardTitle", v)}
            />
            <LimitedField
              label="Reward name"
              value={profile.rewardName}
              maxLength={FIELD_LIMITS.rewardName}
              onChange={(v) => updateField("rewardName", v)}
            />
            <label className="auth-field">
              <span className="auth-label">Order value (₹)</span>
              <input
                className="auth-input"
                type="number"
                min={0}
                step={10}
                value={profile.avgOrderValue}
                onChange={(e) => updateField("avgOrderValue", Number(e.target.value))}
              />
              <span className="merchant-field-hint">Used to calculate customer lifetime value</span>
            </label>
          </>
        )}

        {section === "notifications" && (
          <>
            <ToggleRow
              label="Stamp requests"
              description="Notify when a customer collects a stamp"
              checked={profile.stampNotifications}
              onChange={(v) => updateField("stampNotifications", v)}
            />
            <ToggleRow
              label="Pending approvals"
              description="Alert for stamps awaiting your review"
              checked={profile.approvalNotifications}
              onChange={(v) => updateField("approvalNotifications", v)}
            />
            <ToggleRow
              label="Marketing emails"
              description="Product updates and tips from Froq"
              checked={profile.marketingEmails}
              onChange={(v) => updateField("marketingEmails", v)}
            />
          </>
        )}

        {section === "account" && (
          <>
            <PlainField
              label="Email"
              value={profile.email}
              onChange={(v) => updateField("email", v)}
              type="email"
              inputMode="email"
            />
            <PlainField
              label="Phone"
              value={profile.phone}
              onChange={(v) => updateField("phone", v)}
              inputMode="tel"
            />
          </>
        )}
          </div>

          <div className="merchant-edit-sheet-actions">
            <button type="button" className="merchant-edit-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="cta-btn merchant-cta-accent" onClick={onSave}>
              Save changes
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="merchant-toggle-row">
      <div>
        <div className="merchant-toggle-label">{label}</div>
        <div className="merchant-toggle-desc">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`merchant-toggle${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="merchant-toggle-knob" />
      </button>
    </div>
  );
}
