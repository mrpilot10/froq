"use client";

import type { ReactNode } from "react";
import { FIELD_LIMITS } from "@/lib/merchant/constants";
import { branchLabelFromPlace, uniqueBranchLabel } from "@/lib/merchant/places";
import type { QueueStoreHours } from "@/lib/merchant/queue-hours";
import { EMPTY_BRANCH_CONTACT, type Branch, type BranchContact } from "@/lib/merchant/types";
import {
  GoogleBusinessSearch,
  type GoogleBusinessSelection,
} from "./google-business-search";
import { QueueHoursFields } from "./queue/queue-hours-fields";

/**
 * Everything one branch publishes: its name plus the contact details, links,
 * and Google listing customers see. Onboarding, the branches drawer, and
 * business settings all edit this same shape through the field groups below,
 * so the three entry points can't drift apart.
 */
export type BranchDraft = BranchContact & { name: string };

export const EMPTY_BRANCH_DRAFT: BranchDraft = { ...EMPTY_BRANCH_CONTACT, name: "" };

export function toBranchDraft(branch: Branch | null | undefined): BranchDraft {
  if (!branch) return EMPTY_BRANCH_DRAFT;
  return {
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    email: branch.email,
    websiteUrl: branch.websiteUrl,
    instagramUrl: branch.instagramUrl,
    facebookUrl: branch.facebookUrl,
    xUrl: branch.xUrl,
    googleBusinessUrl: branch.googleBusinessUrl,
    googlePlaceId: branch.googlePlaceId,
    googleMapsUrl: branch.googleMapsUrl,
  };
}

/**
 * A Google listing supplies the address and map link, but every outlet of a
 * chain shares one display name — so the branch is named after its area and
 * disambiguated against the names already in use.
 */
export function applyPlaceToDraft(
  draft: BranchDraft,
  place: GoogleBusinessSelection,
  takenNames: string[] = [],
): BranchDraft {
  const area = branchLabelFromPlace({
    address: place.address,
    addressParts: place.addressParts,
  });
  return {
    ...draft,
    googlePlaceId: place.placeId,
    googleMapsUrl: place.googleMapsUrl,
    address: place.address.trim() || draft.address,
    name: area
      ? uniqueBranchLabel(
          area,
          { address: place.address, addressParts: place.addressParts },
          takenNames,
        )
      : draft.name,
  };
}

export type BranchFieldSetter = <K extends keyof BranchDraft>(
  key: K,
  value: BranchDraft[K],
) => void;

interface FieldGroupProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function BranchFieldGroup({ title, hint, children }: FieldGroupProps) {
  return (
    <section className="merchant-field-group">
      <h4 className="merchant-field-group-title">{title}</h4>
      {hint ? <p className="merchant-field-group-hint">{hint}</p> : null}
      <div className="merchant-field-grid">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  type?: string;
  inputMode?: "text" | "url" | "email" | "tel";
  /** Span the full grid row (website, address, long URLs). */
  fullWidth?: boolean;
}

function BranchField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  type = "text",
  inputMode,
  fullWidth = false,
}: FieldProps) {
  return (
    <label className={`auth-field${fullWidth ? " merchant-field--full" : ""}`}>
      <span className="auth-label">{label}</span>
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

interface LocationFieldsProps {
  draft: BranchDraft;
  onChange: BranchFieldSetter;
  /** Replaces the whole draft — a picked listing fills name, address, and links at once. */
  onApplyPlace: (place: GoogleBusinessSelection) => void;
  /** Shown as the linked listing's title, since Google names every outlet the same. */
  businessName: string;
  /** Hide when the caller can't rename the branch (settings for non-owners). */
  showName?: boolean;
  searchHint?: string;
  searchPlaceholder?: string;
  autoFocus?: boolean;
  onSelectedAndContinue?: () => void;
  grouped?: boolean;
}

export function BranchLocationFields({
  draft,
  onChange,
  onApplyPlace,
  businessName,
  showName = true,
  searchHint = "Pick the outlet you're adding — we'll fill its address and map link.",
  searchPlaceholder = "Search this branch on Google…",
  autoFocus = false,
  onSelectedAndContinue,
  grouped = true,
}: LocationFieldsProps) {
  const search = (
    <GoogleBusinessSearch
      autoFocus={autoFocus}
      placeholder={searchPlaceholder}
      hint={searchHint}
      selected={
        draft.googlePlaceId || draft.googleMapsUrl
          ? {
              placeId: draft.googlePlaceId,
              name: businessName || draft.name,
              address: draft.address,
              googleMapsUrl: draft.googleMapsUrl,
            }
          : null
      }
      onSelect={onApplyPlace}
      onClear={() => {
        onChange("googlePlaceId", "");
        onChange("googleMapsUrl", "");
      }}
      onSelectedAndContinue={onSelectedAndContinue}
    />
  );

  // Address is almost always long — keep name + address stacked so the hint
  // never stretches one column and leaves the other looking uneven.
  const details = (
    <div className="merchant-location-details">
      <div className="merchant-field-grid merchant-field-grid--stack">
        {showName ? (
          <BranchField
            label="Branch name"
            value={draft.name}
            maxLength={60}
            placeholder="Koregaon Park"
            onChange={(v) => onChange("name", v)}
          />
        ) : null}
        <BranchField
          label="Address"
          value={draft.address}
          maxLength={FIELD_LIMITS.address}
          placeholder="42 Market Street"
          onChange={(v) => onChange("address", v)}
        />
      </div>
      {showName ? (
        <p className="merchant-field-hint">
          Name it after the area so branches stay easy to tell apart.
        </p>
      ) : null}
    </div>
  );

  if (!grouped) {
    return (
      <div className="merchant-location-fields">
        {search}
        {details}
      </div>
    );
  }

  return (
    <section className="merchant-field-group">
      <h4 className="merchant-field-group-title">Location</h4>
      <div className="merchant-location-fields">
        {search}
        {details}
      </div>
    </section>
  );
}

interface FieldsProps {
  draft: BranchDraft;
  onChange: BranchFieldSetter;
  grouped?: boolean;
}

export function BranchContactFields({ draft, onChange, grouped = true }: FieldsProps) {
  const body = (
    <>
      <BranchField
        label="Phone"
        value={draft.phone}
        type="tel"
        inputMode="tel"
        placeholder="+91 98765 43210"
        onChange={(v) => onChange("phone", v)}
      />
      <BranchField
        label="Email"
        value={draft.email}
        type="email"
        inputMode="email"
        placeholder="hello@yourbusiness.com"
        onChange={(v) => onChange("email", v)}
      />
      <BranchField
        label="Website"
        value={draft.websiteUrl}
        inputMode="url"
        maxLength={FIELD_LIMITS.url}
        placeholder="yourbusiness.com"
        onChange={(v) => onChange("websiteUrl", v)}
        fullWidth
      />
    </>
  );

  if (!grouped) return <div className="merchant-field-grid">{body}</div>;
  return (
    <BranchFieldGroup title="Contact" hint="Shown on the loyalty card for this branch.">
      {body}
    </BranchFieldGroup>
  );
}

export function BranchLinkFields({ draft, onChange, grouped = true }: FieldsProps) {
  const body = (
    <>
      <BranchField
        label="Instagram"
        value={draft.instagramUrl}
        maxLength={FIELD_LIMITS.url}
        placeholder="instagram.com/handle"
        onChange={(v) => onChange("instagramUrl", v)}
      />
      <BranchField
        label="Facebook"
        value={draft.facebookUrl}
        maxLength={FIELD_LIMITS.url}
        placeholder="facebook.com/page"
        onChange={(v) => onChange("facebookUrl", v)}
      />
      <BranchField
        label="X (Twitter)"
        value={draft.xUrl}
        maxLength={FIELD_LIMITS.url}
        placeholder="x.com/handle"
        onChange={(v) => onChange("xUrl", v)}
        fullWidth
      />
      <BranchField
        label="Google reviews"
        value={draft.googleBusinessUrl}
        inputMode="url"
        maxLength={FIELD_LIMITS.url}
        placeholder="g.page/r/…/review"
        onChange={(v) => onChange("googleBusinessUrl", v)}
        fullWidth
      />
    </>
  );

  if (!grouped) return <div className="merchant-field-grid">{body}</div>;
  return <BranchFieldGroup title="Links & social">{body}</BranchFieldGroup>;
}

interface TimingsFieldsProps {
  value: QueueStoreHours;
  onChange: (next: QueueStoreHours) => void;
  hint?: string;
}

/** Open hours for one branch — shared by Queue and Reservations. */
export function BranchTimingsFields({
  value,
  onChange,
  hint = "Used by Queue and Reservations for this location.",
}: TimingsFieldsProps) {
  return (
    <section className="merchant-field-group merchant-field-group--timings">
      <h4 className="merchant-field-group-title">Timings</h4>
      {hint ? <p className="merchant-field-group-hint">{hint}</p> : null}
      <QueueHoursFields hideAutos compact value={value} onChange={onChange} />
    </section>
  );
}
