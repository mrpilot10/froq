"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { BRAND_COLORS, FIELD_LIMITS } from "@/lib/merchant/constants";
import { fileToLogoDataUrl, LOGO_UPLOAD_HINT } from "@/lib/merchant/image";
import {
  validateQueueStoreHours,
  type QueueStoreHours,
} from "@/lib/merchant/queue-hours";
import {
  isBranchEditSection,
  type Branch,
  type BranchContact,
  type MemberRole,
  type MerchantEditSection,
  type MerchantProduct,
  type MerchantProfile,
} from "@/lib/merchant/types";
import {
  AccountSettingsPanel,
  type AccountSettingsHandle,
} from "./account-settings-panel";
import {
  applyPlaceToDraft,
  BranchContactFields,
  BranchLinkFields,
  BranchLocationFields,
  BranchTimingsFields,
  EMPTY_BRANCH_DRAFT,
  toBranchDraft,
  type BranchDraft,
} from "./branch-fields";
import { hoursFromBranch } from "./queue/queue-hours-fields";

interface MerchantProfileEditScreenProps {
  section: MerchantEditSection;
  profile: MerchantProfile;
  accountFirstName?: string;
  accountLastName?: string;
  role?: MemberRole;
  productIds?: MerchantProduct[];
  branchIds?: string[];
  branches?: Branch[];
  /** Branch whose contact details, links, and listing are being edited. */
  editBranch?: Branch | null;
  onChange: (profile: MerchantProfile) => void;
  onClose: () => void;
  onSave: () => void;
  onSaveBranch?: (
    branchId: string,
    patch: Partial<BranchContact> & { name?: string },
  ) => Promise<boolean> | boolean;
  /** Contact + store timings for a branch (preferred over separate saves). */
  onSaveBranchDetails?: (
    branchId: string,
    patch: Partial<BranchContact> & { name?: string },
    hours: Pick<QueueStoreHours, "openTime" | "closeTime" | "openDays">,
  ) => Promise<boolean> | boolean;
  /** @deprecated Prefer onSaveBranchDetails — kept for legacy callers. */
  onSaveStoreHours?: (
    branchId: string,
    hours: Pick<QueueStoreHours, "openTime" | "closeTime" | "openDays">,
  ) => Promise<boolean> | boolean;
  onSelectEditBranch?: (branchId: string) => void;
  onAccountNameUpdated?: (firstName: string, lastName: string) => void;
  /** Non-owners use this to leave the store and delete their login. */
  onDeleteAccount?: () => void;
}

const SECTION_META: Record<
  Exclude<MerchantEditSection, null>,
  { title: string; subtitle: string }
> = {
  business: {
    title: "Store details",
    subtitle: "Logo, brand color, and business name",
  },
  branch: {
    title: "Branch details",
    subtitle: "Location, timings, contact, and links for this branch",
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
    subtitle: "Name, login, and contact preferences",
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

/**
 * Branch details belong to one location, so the sheet has to say which one —
 * and offer a way to switch when the merchant runs more than one.
 */
function BranchScopeNotice({
  branches,
  editBranch,
  onSelectEditBranch,
}: {
  branches: Branch[];
  editBranch: Branch | null;
  onSelectEditBranch?: (branchId: string) => void;
}) {
  if (!editBranch) {
    return (
      <p className="merchant-field-hint" role="status">
        Add a branch first to publish location, contact, and links.
      </p>
    );
  }
  if (branches.length < 2 || !onSelectEditBranch) {
    return (
      <p className="merchant-branch-scope" role="status">
        Applies to <strong>{editBranch.name}</strong>
      </p>
    );
  }
  return (
    <label className="auth-field">
      <span className="auth-label">Branch</span>
      <select
        className="auth-input"
        value={editBranch.id}
        onChange={(event) => onSelectEditBranch(event.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.isDefault ? " (Main)" : ""}
          </option>
        ))}
      </select>
      <span className="merchant-field-hint">
        Each branch publishes its own contact details, links, and open hours.
      </span>
    </label>
  );
}

export function MerchantProfileEditScreen({
  section,
  profile,
  accountFirstName = "",
  accountLastName = "",
  role,
  productIds = [],
  branchIds = [],
  branches = [],
  editBranch = null,
  onChange,
  onClose,
  onSave,
  onSaveBranch,
  onSaveBranchDetails,
  onSaveStoreHours,
  onSelectEditBranch,
  onAccountNameUpdated,
  onDeleteAccount,
}: MerchantProfileEditScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rewardImageInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<AccountSettingsHandle>(null);
  const [closingAccount, setClosingAccount] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [draftFor, setDraftFor] = useState({
    branchId: editBranch?.id ?? "",
    draft: toBranchDraft(editBranch),
    hours: hoursFromBranch(editBranch, profile),
  });

  const branchSection = isBranchEditSection(section);
  const branchId = editBranch?.id ?? "";
  // Only owners can rename a branch, so everyone else edits it without the name field.
  const canRenameBranch = role === "owner";

  // Re-seed the draft when the sheet targets a different branch, so switching
  // branches mid-edit never carries the previous one's values over.
  if (draftFor.branchId !== branchId) {
    setDraftFor({
      branchId,
      draft: toBranchDraft(editBranch),
      hours: hoursFromBranch(editBranch, profile),
    });
  }
  const branchDraft = draftFor.branchId === branchId ? draftFor.draft : EMPTY_BRANCH_DRAFT;
  const hoursDraft =
    draftFor.branchId === branchId
      ? draftFor.hours
      : hoursFromBranch(editBranch, profile);

  const meta = section ? SECTION_META[section] : null;

  function setBranchDraft(next: (prev: BranchDraft) => BranchDraft) {
    setDraftFor((prev) => ({ ...prev, draft: next(prev.draft) }));
  }

  function updateBranchField<K extends keyof BranchDraft>(key: K, value: BranchDraft[K]) {
    setBranchDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveBranch() {
    if (!branchId || (!onSaveBranchDetails && !onSaveBranch)) return;
    const hoursError = validateQueueStoreHours(hoursDraft);
    if (hoursError) {
      toast.error(hoursError);
      return;
    }
    setSavingBranch(true);
    try {
      const { name, ...contact } = branchDraft;
      const patch = canRenameBranch && name.trim() ? { ...contact, name: name.trim() } : contact;
      const hours = {
        openTime: hoursDraft.openTime,
        closeTime: hoursDraft.closeTime,
        openDays: hoursDraft.openDays,
      };
      if (onSaveBranchDetails) {
        const ok = await onSaveBranchDetails(branchId, patch, hours);
        if (ok !== false) onClose();
        return;
      }
      const ok = await onSaveBranch?.(branchId, patch);
      if (ok === false) return;
      if (onSaveStoreHours) {
        const hoursOk = await onSaveStoreHours(branchId, hours);
        if (hoursOk === false) return;
      }
      onClose();
    } finally {
      setSavingBranch(false);
    }
  }

  async function handleAccountDone() {
    setClosingAccount(true);
    try {
      const ok = await accountRef.current?.flushName();
      if (ok === false) return;
      onClose();
    } finally {
      setClosingAccount(false);
    }
  }

  function handleSheetClose() {
    if (section === "account") {
      void handleAccountDone();
      return;
    }
    onClose();
  }

  function updateField<K extends keyof MerchantProfile>(key: K, value: MerchantProfile[K]) {
    onChange({ ...profile, [key]: value });
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const dataUrl = await fileToLogoDataUrl(file);
    updateField("logoDataUrl", dataUrl);
    input.value = "";
  }

  async function handleRewardImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const dataUrl = await fileToLogoDataUrl(file);
    updateField("rewardImageDataUrl", dataUrl);
    input.value = "";
  }

  return (
    <BottomSheet
      open={section !== null}
      onClose={handleSheetClose}
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
                  onChange={(event) => void handleLogoUpload(event)}
                />
              </div>
              <span className="merchant-field-hint">{LOGO_UPLOAD_HINT}</span>
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
              hint="Shared by every branch, and shown on your customer loyalty card."
            />
          </>
        )}

        {branchSection && (
          <BranchScopeNotice
            branches={branches}
            editBranch={editBranch}
            onSelectEditBranch={onSelectEditBranch}
          />
        )}

        {section === "branch" && editBranch && (
          <>
            <BranchLocationFields
              draft={branchDraft}
              onChange={updateBranchField}
              onApplyPlace={(place) =>
                setBranchDraft((prev) =>
                  applyPlaceToDraft(
                    prev,
                    place,
                    branches.filter((b) => b.id !== branchId).map((b) => b.name),
                  ),
                )
              }
              businessName={profile.businessName}
              showName={canRenameBranch}
              searchHint="We’ll fill this branch’s address and map link from the listing you pick."
            />
            <BranchTimingsFields
              value={hoursDraft}
              onChange={(hours) => setDraftFor((prev) => ({ ...prev, hours }))}
            />
            <BranchContactFields draft={branchDraft} onChange={updateBranchField} />
            <BranchLinkFields draft={branchDraft} onChange={updateBranchField} />
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
            <div className="merchant-logo-field">
              <span className="auth-label">Reward image</span>
              <div className="merchant-logo-upload">
                <div className="merchant-logo-preview">
                  {profile.rewardImageDataUrl ? (
                    <Image
                      src={profile.rewardImageDataUrl}
                      alt="Reward"
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
                    onClick={() => rewardImageInputRef.current?.click()}
                  >
                    {profile.rewardImageDataUrl ? "Replace" : "Upload"}
                  </button>
                  {profile.rewardImageDataUrl && (
                    <button
                      type="button"
                      className="merchant-logo-remove"
                      onClick={() => updateField("rewardImageDataUrl", undefined)}
                      aria-label="Remove reward image"
                    >
                      <Trash2 size={16} strokeWidth={2.3} />
                    </button>
                  )}
                </div>
                <input
                  ref={rewardImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="merchant-file-input"
                  onChange={(event) => void handleRewardImageUpload(event)}
                />
              </div>
              <span className="merchant-field-hint">
                Shown to customers when they unlock and claim the reward.
              </span>
            </div>
            <label className="auth-field">
              <span className="auth-label">Stamps to reward</span>
              <input
                className="auth-input"
                type="number"
                min={5}
                max={20}
                value={profile.totalStamps}
                onChange={(e) => updateField("totalStamps", Number(e.target.value))}
              />
              <span className="merchant-field-hint">How many stamps a customer collects to claim the reward (minimum 5)</span>
            </label>
            <ToggleRow
              label="Start again after reward"
              description="Let customers collect stamps on a new card after they claim a reward"
              checked={profile.restartAfterReward}
              onChange={(v) => updateField("restartAfterReward", v)}
            />
            {profile.restartAfterReward ? (
              <div className="auth-field">
                <span className="auth-label">Wait before next reward</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="auth-input"
                    style={{ flex: 1 }}
                    type="number"
                    min={0}
                    value={profile.rewardCooldownValue}
                    onChange={(e) =>
                      updateField("rewardCooldownValue", Number(e.target.value))
                    }
                  />
                  <select
                    className="auth-input"
                    style={{ flex: 1 }}
                    value={profile.rewardCooldownUnit}
                    disabled={profile.rewardCooldownValue <= 0}
                    onChange={(e) =>
                      updateField(
                        "rewardCooldownUnit",
                        e.target.value as "hours" | "days" | "weeks",
                      )
                    }
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
                <span className="merchant-field-hint">
                  After a reward unlocks, keep the QR locked for this long. After redeem, the next
                  stamp card stays locked for the same wait. 0 = no wait. Changing this only affects
                  future rewards — customers already waiting keep their original unlock time.
                </span>
              </div>
            ) : null}
            <ToggleRow
              label="Birthday double stamps"
              description="On a customer's birthday, notify them they can earn double stamps — and award 2 stamps per visit that day"
              checked={profile.birthdayDoubleStamps}
              onChange={(v) => updateField("birthdayDoubleStamps", v)}
            />
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
              label="Notify Staff for pending stamp approvals"
              description="Email and in-app reminder after 3 hours if stamps are still waiting"
              checked={profile.notifyStaffPendingApprovals}
              onChange={(v) => updateField("notifyStaffPendingApprovals", v)}
            />
            <ToggleRow
              label="Notify Managers for pending stamp approvals"
              description="Email and in-app reminder after 6 hours if stamps are still waiting"
              checked={profile.notifyManagerPendingApprovals}
              onChange={(v) => updateField("notifyManagerPendingApprovals", v)}
            />
            {role === "owner" ? (
              <ToggleRow
                label="Notify Owners for pending stamp approvals"
                description="Include owners in escalation reminders"
                checked={profile.notifyOwnerPendingApprovals}
                onChange={(v) => updateField("notifyOwnerPendingApprovals", v)}
              />
            ) : null}
          </>
        )}

        {section === "account" && (
          <AccountSettingsPanel
            ref={accountRef}
            email={profile.email}
            phone={profile.phone}
            firstName={accountFirstName}
            lastName={accountLastName}
            role={role}
            productIds={productIds}
            branchIds={branchIds}
            branchNameById={Object.fromEntries(branches.map((b) => [b.id, b.name]))}
            onPhoneUpdated={(phone) => onChange({ ...profile, phone })}
            onNameUpdated={onAccountNameUpdated}
            onDeleteAccount={onDeleteAccount}
          />
        )}
          </div>

          {section === "account" ? (
            <div className="merchant-edit-sheet-actions">
              <button
                type="button"
                className="cta-btn merchant-cta-accent"
                disabled={closingAccount}
                onClick={() => void handleAccountDone()}
              >
                {closingAccount ? "Saving…" : "Done"}
              </button>
            </div>
          ) : (
            <div className="merchant-edit-sheet-actions">
              <button type="button" className="merchant-edit-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="cta-btn merchant-cta-accent"
                disabled={branchSection && (!branchId || savingBranch)}
                onClick={
                  branchSection ? () => void handleSaveBranch() : onSave
                }
              >
                {branchSection && savingBranch ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
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
