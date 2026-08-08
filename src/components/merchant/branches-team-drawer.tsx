"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Check,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  formatHoursSummary,
  validateQueueStoreHours,
  type QueueStoreHours,
} from "@/lib/merchant/queue-hours";
import type {
  Branch,
  BranchContact,
  MemberRole,
  MerchantMember,
  MerchantProduct,
} from "@/lib/merchant/types";
import {
  ASSIGNABLE_ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
} from "@/lib/merchant/roles";
import { PRODUCTS } from "@/lib/merchant/nav";
import type { ProductBranchMap } from "@/lib/merchant/branch-assignments";
import { planUpgradeSummary } from "@/lib/merchant/plan-summary";
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

interface BranchesTeamDrawerProps {
  view: "branches" | "team" | null;
  branches: Branch[];
  /** Shown as the title of a linked Google listing, which names every outlet the same. */
  businessName: string;
  members: MerchantMember[];
  role: MemberRole;
  /** @deprecated Global create is uncapped; kept optional for callers. */
  maxBranches?: number;
  /** Active branch ids per product — shown as chips on each row. */
  productBranches?: ProductBranchMap;
  /** Live loyalty plan id — unused for create; retained for older callers. */
  loyaltyPlanId?: string | null;
  /** Opens loyalty checkout (or manage-plan) for the next pack. Receives that pack's plan id. */
  onUpgradePlan?: (nextPlanId: string) => void;
  onCreateBranch: (input: {
    name: string;
    contact?: Partial<BranchContact>;
    copyContactFromMainBranch?: boolean;
    hours?: Pick<QueueStoreHours, "openTime" | "closeTime" | "openDays">;
    assignToProduct?: MerchantProduct;
  }) => Promise<string | null>;
  /** Contact + store timings in one save (Queue + Reservations use the hours). */
  onSaveBranchDetails: (
    id: string,
    patch: Partial<BranchContact> & { name?: string },
    hours: Pick<QueueStoreHours, "openTime" | "closeTime" | "openDays">,
  ) => Promise<boolean>;
  onDeleteBranch: (id: string) => Promise<boolean>;
  onInviteMember: (input: {
    email: string;
    name?: string;
    role: MemberRole;
    branchIds?: string[];
    productIds?: MerchantProduct[];
  }) => Promise<boolean>;
  onUpdateMemberRole: (
    id: string,
    role: MemberRole,
    branchIds?: string[],
    productIds?: MerchantProduct[],
  ) => Promise<boolean>;
  onRemoveMember: (id: string) => Promise<boolean>;
  onClose: () => void;
}

export function BranchesTeamDrawer(props: BranchesTeamDrawerProps) {
  const { view, onClose } = props;
  return (
    <BottomSheet
      open={view !== null}
      onClose={onClose}
      labelledBy="manage-title"
      className="merchant-theme merchant-edit-drawer"
    >
      {view === "branches" && <BranchesPanel {...props} />}
      {view === "team" && <TeamPanel {...props} />}
    </BottomSheet>
  );
}

function BranchesPanel({
  branches,
  businessName,
  role,
  productBranches = {},
  onCreateBranch,
  onSaveBranchDetails,
  onDeleteBranch,
  onInviteMember,
}: BranchesTeamDrawerProps) {
  const [adding, setAdding] = useState(false);
  const canInvite = role === "owner";

  return (
    <div className="merchant-edit-sheet merchant-manage-sheet">
      <div className="merchant-edit-sheet-head merchant-manage-sheet-head">
        <div className="wizard-form-icon">
          <MapPin size={22} strokeWidth={2.2} />
        </div>
        <div className="merchant-manage-sheet-copy">
          <h3 id="manage-title" className="merchant-edit-sheet-title">
            Branches
          </h3>
          <p className="merchant-edit-sheet-sub">
            Shared across every Froq product. Activate locations per product in
            that product&apos;s settings.
          </p>
        </div>
      </div>

      <div className="merchant-manage-list">
        {branches.map((branch) => (
          <BranchRow
            key={branch.id}
            branch={branch}
            branches={branches}
            businessName={businessName}
            productLabels={productLabelsForBranch(branch.id, productBranches)}
            onSave={(patch, hours) => onSaveBranchDetails(branch.id, patch, hours)}
            onDelete={() => onDeleteBranch(branch.id)}
          />
        ))}
      </div>

      {adding ? (
        <AddBranchForm
          branches={branches}
          canInvite={canInvite}
          onCreateBranch={onCreateBranch}
          onInviteMember={onInviteMember}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="merchant-manage-add" onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={2.4} />
          Add branch
        </button>
      )}
    </div>
  );
}

const PRODUCT_CHIP: Record<MerchantProduct, string> = {
  loyalty: "Loyalty",
  queue: "Waitlist",
  reservation: "Reservations",
  menu: "AI Menu",
};

function productLabelsForBranch(
  branchId: string,
  map: ProductBranchMap,
): string[] {
  const labels: string[] = [];
  for (const product of Object.keys(PRODUCT_CHIP) as MerchantProduct[]) {
    if (map[product]?.includes(branchId)) labels.push(PRODUCT_CHIP[product]);
  }
  return labels;
}

function BranchLimitUpsell({
  loyaltyPlanId,
  branchCount,
  maxBranches,
  canUpgrade,
  onUpgrade,
}: {
  loyaltyPlanId: string | null;
  branchCount: number;
  maxBranches: number;
  canUpgrade: boolean;
  onUpgrade: (nextPlanId: string) => void;
}) {
  const summary = planUpgradeSummary({ product: "loyalty", planId: loyaltyPlanId });
  const next = summary.nextPlan;
  const branchHighlight =
    summary.nextHighlights.find((item) => item.toLowerCase().includes("branch")) ??
    summary.nextHighlights[0] ??
    null;
  const otherHighlights = summary.nextHighlights.filter((h) => h !== branchHighlight);
  const priceLabel = next
    ? `${next.priceLabel}${summary.currentCycleLabel}`
    : null;

  if (!next) {
    return (
      <div className="merchant-branch-upsell">
        <div className="merchant-branch-upsell-icon" aria-hidden>
          <Check size={18} strokeWidth={2.4} />
        </div>
        <div className="merchant-branch-upsell-copy">
          <p className="merchant-branch-upsell-title">You’re on the top plan</p>
          <p className="merchant-branch-upsell-sub">
            All {maxBranches} branch slots are in use. Remove a location if you need to add a
            different one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-branch-upsell">
      <div className="merchant-branch-upsell-icon" aria-hidden>
        <Sparkles size={18} strokeWidth={2.2} />
      </div>
      <div className="merchant-branch-upsell-copy">
        <p className="merchant-branch-upsell-eyebrow">
          {branchCount}/{maxBranches} branches used
        </p>
        <p className="merchant-branch-upsell-title">
          Unlock more locations with {next.name}
        </p>
        <p className="merchant-branch-upsell-sub">
          {branchHighlight
            ? `Upgrade for ${branchHighlight}${
                otherHighlights.length > 0 ? ` · ${otherHighlights.join(" · ")}` : ""
              }.`
            : `Move to ${next.name} to add more branches and grow across locations.`}
        </p>
      </div>

      <div className="merchant-branch-upsell-pack">
        <span className="merchant-branch-upsell-pack-name">Next pack · {next.name}</span>
        <span className="merchant-branch-upsell-pack-price">{priceLabel}</span>
      </div>

      {canUpgrade ? (
        <button
          type="button"
          className="merchant-branch-upsell-cta"
          onClick={() => onUpgrade(next.id)}
        >
          <span>Upgrade to {next.name}</span>
          <span className="merchant-branch-upsell-price">{priceLabel}</span>
          <ArrowUpRight size={15} strokeWidth={2.4} aria-hidden />
        </button>
      ) : (
        <p className="merchant-branch-upsell-note">Ask the owner to upgrade the plan.</p>
      )}
    </div>
  );
}

type AddBranchStep = "location" | "details";

const ADD_BRANCH_STEPS: { id: AddBranchStep; label: string }[] = [
  { id: "location", label: "Location" },
  { id: "details", label: "Timings & contact" },
];

/**
 * Two steps: find the location on Google (which supplies the name, address, and
 * map link), then decide whether it reuses the main branch's contact details.
 */
function AddBranchForm({
  branches,
  canInvite,
  onCreateBranch,
  onInviteMember,
  onDone,
}: {
  branches: Branch[];
  canInvite: boolean;
  onCreateBranch: BranchesTeamDrawerProps["onCreateBranch"];
  onInviteMember: BranchesTeamDrawerProps["onInviteMember"];
  onDone: () => void;
}) {
  const [step, setStep] = useState<AddBranchStep>("location");
  const [draft, setDraft] = useState<BranchDraft>(EMPTY_BRANCH_DRAFT);
  const [sameAsMain, setSameAsMain] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("staff");
  const [inviteProductIds, setInviteProductIds] = useState<MerchantProduct[]>([]);
  const [busy, setBusy] = useState(false);

  const mainBranch = branches.find((b) => b.isDefault) ?? branches[0] ?? null;
  const [hours, setHours] = useState<QueueStoreHours>(() => hoursFromBranch(mainBranch));

  function updateDraft<K extends keyof BranchDraft>(key: K, value: BranchDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const add = async () => {
    if (!draft.name.trim() || busy) return;
    const hoursError = validateQueueStoreHours(hours);
    if (hoursError) {
      toast.error(hoursError);
      return;
    }
    setBusy(true);
    const { name, phone, email, websiteUrl, instagramUrl, facebookUrl, xUrl, googleBusinessUrl } =
      draft;
    const branchId = await onCreateBranch({
      name: name.trim(),
      copyContactFromMainBranch: sameAsMain,
      hours: {
        openTime: hours.openTime,
        closeTime: hours.closeTime,
        openDays: hours.openDays,
      },
      contact: {
        address: draft.address,
        googlePlaceId: draft.googlePlaceId,
        googleMapsUrl: draft.googleMapsUrl,
        ...(sameAsMain
          ? {}
          : { phone, email, websiteUrl, instagramUrl, facebookUrl, xUrl, googleBusinessUrl }),
      },
    });
    if (branchId && canInvite && inviteOpen && inviteEmail.trim()) {
      await onInviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        branchIds: inviteRole === "owner" ? [] : [branchId],
        productIds: inviteRole === "owner" ? [] : inviteProductIds,
      });
    }
    setBusy(false);
    if (branchId) onDone();
  };

  if (step === "location") {
    return (
      <div className="merchant-manage-form merchant-manage-form--branch-edit">
        <AddBranchProgress step="location" />

        <BranchLocationFields
          draft={draft}
          onChange={updateDraft}
          onApplyPlace={(place) =>
            setDraft((prev) =>
              applyPlaceToDraft(
                prev,
                place,
                branches.map((b) => b.name),
              ),
            )
          }
          businessName=""
          grouped
        />

        <div className="merchant-manage-form-actions">
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            onClick={onDone}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            onClick={() => setStep("details")}
            disabled={!draft.name.trim()}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-manage-form merchant-manage-form--branch-edit">
      <AddBranchProgress step="details" />

      <BranchTimingsFields
        value={hours}
        onChange={setHours}
        hint="Starts from your main branch — adjust if this location keeps different hours."
      />

      <div className="branch-access-picker">
        <button
          type="button"
          className={`branch-access-option${sameAsMain ? " is-selected" : ""}`}
          onClick={() => setSameAsMain(true)}
        >
          <span className="branch-access-check">
            {sameAsMain && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="branch-access-name">
            Same as {mainBranch?.name ?? "main branch"}
          </span>
        </button>
        <button
          type="button"
          className={`branch-access-option${!sameAsMain ? " is-selected" : ""}`}
          onClick={() => setSameAsMain(false)}
        >
          <span className="branch-access-check">
            {!sameAsMain && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="branch-access-name">Add new details</span>
        </button>
      </div>
      <span className="merchant-field-hint">
        {sameAsMain
          ? "Copies the phone, email, website, and socials across. You can edit them for this branch later."
          : "These show on the loyalty card for customers who join at this branch."}
      </span>

      {!sameAsMain && (
        <>
          <BranchContactFields draft={draft} onChange={updateDraft} />
          <BranchLinkFields draft={draft} onChange={updateDraft} />
        </>
      )}

      {canInvite && (
        <div className={`merchant-accordion${inviteOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="merchant-accordion-head"
            aria-expanded={inviteOpen}
            onClick={() => setInviteOpen((v) => !v)}
          >
            <span className="merchant-accordion-head-icon">
              <UserPlus size={16} strokeWidth={2.2} />
            </span>
            <span className="merchant-accordion-head-copy">
              <span className="merchant-accordion-head-title">Invite a teammate</span>
              <span className="merchant-accordion-head-sub">
                Give someone access to this branch (optional)
              </span>
            </span>
            <ChevronDown size={16} strokeWidth={2.4} className="merchant-accordion-caret" />
          </button>

          {inviteOpen && (
            <div className="merchant-accordion-body">
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  className="auth-input"
                  type="email"
                  value={inviteEmail}
                  placeholder="name@example.com"
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <RolePicker value={inviteRole} onChange={setInviteRole} />
              {inviteRole !== "owner" ? (
                <ProductAccessPicker selected={inviteProductIds} onChange={setInviteProductIds} />
              ) : (
                <p className="merchant-field-hint">Owners can access every product.</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="merchant-manage-form-actions">
        <button
          type="button"
          className="merchant-action-btn merchant-action-btn--reject"
          onClick={() => setStep("location")}
          disabled={busy}
        >
          Back
        </button>
        <button
          type="button"
          className="cta-btn merchant-cta-accent"
          onClick={() => void add()}
          disabled={busy || !draft.name.trim()}
        >
          {busy ? "Adding…" : "Add branch"}
        </button>
      </div>
    </div>
  );
}

function AddBranchProgress({ step }: { step: AddBranchStep }) {
  const index = ADD_BRANCH_STEPS.findIndex((s) => s.id === step);
  return (
    <p className="merchant-branch-step">
      Step {index + 1} of {ADD_BRANCH_STEPS.length} · {ADD_BRANCH_STEPS[index].label}
    </p>
  );
}

function branchHoursSummary(branch: Branch): string {
  const hours = hoursFromBranch(branch);
  return formatHoursSummary({ ...hours, autoStart: false, autoClose: false });
}

function BranchRow({
  branch,
  branches,
  businessName,
  productLabels = [],
  onSave,
  onDelete,
}: {
  branch: Branch;
  branches: Branch[];
  businessName: string;
  productLabels?: string[];
  onSave: (
    patch: Partial<BranchContact> & { name?: string },
    hours: Pick<QueueStoreHours, "openTime" | "closeTime" | "openDays">,
  ) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState<BranchDraft>(() => toBranchDraft(branch));
  const [hours, setHours] = useState<QueueStoreHours>(() => hoursFromBranch(branch));
  const [busy, setBusy] = useState(false);

  function updateDraft<K extends keyof BranchDraft>(key: K, value: BranchDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const resetDraft = () => {
    setDraft(toBranchDraft(branch));
    setHours(hoursFromBranch(branch));
  };

  const save = async () => {
    const hoursError = validateQueueStoreHours(hours);
    if (hoursError) {
      toast.error(hoursError);
      return;
    }
    setBusy(true);
    const ok = await onSave(
      { ...draft, name: draft.name.trim() },
      {
        openTime: hours.openTime,
        closeTime: hours.closeTime,
        openDays: hours.openDays,
      },
    );
    setBusy(false);
    if (ok) setEditing(false);
  };

  const remove = async () => {
    setBusy(true);
    const ok = await onDelete();
    setBusy(false);
    if (ok) setConfirmingDelete(false);
  };

  if (confirmingDelete) {
    return (
      <div className="merchant-manage-confirm">
        <div className="merchant-manage-confirm-copy">
          <div className="merchant-manage-item-name">Remove {branch.name}?</div>
          <div className="merchant-manage-item-sub">
            Its QR stops working and customers &amp; analytics move to unassigned. This can&apos;t be
            undone.
          </div>
        </div>
        <div className="merchant-manage-form-actions">
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            onClick={() => setConfirmingDelete(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cta-btn merchant-cta-danger"
            onClick={() => void remove()}
            disabled={busy}
          >
            {busy ? "Removing…" : "Remove branch"}
          </button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="merchant-manage-form merchant-manage-form--branch-edit">
        <BranchLocationFields
          draft={draft}
          onChange={updateDraft}
          onApplyPlace={(place) =>
            setDraft((prev) =>
              applyPlaceToDraft(
                prev,
                place,
                branches.filter((b) => b.id !== branch.id).map((b) => b.name),
              ),
            )
          }
          businessName={businessName}
          searchHint="We’ll fill this branch’s address and map link from the listing you pick."
        />
        <BranchTimingsFields value={hours} onChange={setHours} />
        <BranchContactFields draft={draft} onChange={updateDraft} />
        <BranchLinkFields draft={draft} onChange={updateDraft} />
        <div className="merchant-manage-form-actions">
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            onClick={() => {
              resetDraft();
              setEditing(false);
            }}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            onClick={() => void save()}
            disabled={busy || !draft.name.trim()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-manage-item">
      <div className="merchant-manage-item-icon">
        <MapPin size={16} strokeWidth={2.2} />
      </div>
      <div className="merchant-manage-item-copy">
        <div className="merchant-manage-item-name">
          {branch.name}
          {branch.isDefault && <span className="merchant-manage-tag">Main</span>}
        </div>
        {branch.address ? (
          <div className="merchant-manage-item-sub">{branch.address}</div>
        ) : null}
        <div className="merchant-manage-item-meta">{branchHoursSummary(branch)}</div>
        {productLabels.length > 0 ? (
          <div className="merchant-branch-product-chips" aria-label="Used in">
            {productLabels.map((label) => (
              <span key={label} className="merchant-branch-product-chip">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <div className="merchant-manage-item-meta">Not assigned to a product yet</div>
        )}
      </div>
      <div className="merchant-manage-item-actions">
        <button
          type="button"
          className="merchant-manage-edit"
          aria-label={`Edit ${branch.name}`}
          onClick={() => {
            resetDraft();
            setEditing(true);
          }}
        >
          <Pencil size={15} strokeWidth={2.3} />
        </button>
        {!branch.isDefault && (
          <button
            type="button"
            className="merchant-manage-edit merchant-manage-edit--danger"
            aria-label="Delete branch"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={15} strokeWidth={2.3} />
          </button>
        )}
      </div>
    </div>
  );
}

function branchSummary(branches: Branch[], branchIds: string[]): string {
  if (branchIds.length === 0) {
    return branches.length === 1 ? (branches[0]?.name ?? "1 branch") : "All branches";
  }
  if (branchIds.length === 1) {
    return branches.find((b) => b.id === branchIds[0])?.name ?? "1 branch";
  }
  return `${branchIds.length} branches`;
}

function productSummary(productIds: MerchantProduct[]): string {
  if (productIds.length === 0) return "All products";
  if (productIds.length === 1) {
    return PRODUCTS.find((p) => p.id === productIds[0])?.name ?? "1 product";
  }
  return `${productIds.length} products`;
}

function TeamPanel({
  branches,
  members,
  onInviteMember,
  onUpdateMemberRole,
  onRemoveMember,
}: BranchesTeamDrawerProps) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("staff");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<MerchantProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingMember, setEditingMember] = useState<MerchantMember | null>(null);

  const resetInvite = () => {
    setEmail("");
    setInviteRole("staff");
    setBranchIds([]);
    setProductIds([]);
    setAdding(false);
  };

  const invite = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    const ok = await onInviteMember({
      email: email.trim(),
      role: inviteRole,
      branchIds,
      productIds,
    });
    setBusy(false);
    if (ok) resetInvite();
  };

  return (
    <div className="merchant-edit-sheet merchant-manage-sheet">
      <div className="merchant-edit-sheet-head merchant-manage-sheet-head">
        <div className="wizard-form-icon">
          <Users size={22} strokeWidth={2.2} />
        </div>
        <div className="merchant-manage-sheet-copy">
          <h3 id="manage-title" className="merchant-edit-sheet-title">
            Team
          </h3>
          <p className="merchant-edit-sheet-sub">
            Invite owners, managers, or staff. They&apos;ll get an email to set a password.
          </p>
        </div>
      </div>

      <div className="merchant-manage-list">
        {members.map((member) => (
          <div key={member.id} className="merchant-manage-item">
            <div className="merchant-manage-item-icon merchant-manage-item-icon--avatar">
              {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="merchant-manage-item-copy">
              <div className="merchant-manage-item-name">
                {member.name || member.email}
                {member.role === "owner" && <span className="merchant-manage-tag">Owner</span>}
                {member.role === "manager" && (
                  <span className="merchant-manage-tag">Manager</span>
                )}
                {member.role !== "owner" && !member.joined && (
                  <span className="merchant-manage-tag merchant-manage-tag--pending">Invited</span>
                )}
                {member.role !== "owner" && member.joined && (
                  <span className="merchant-manage-tag merchant-manage-tag--joined">Joined</span>
                )}
              </div>
              <div className="merchant-manage-item-sub">
                {ROLE_LABELS[member.role]} · {branchSummary(branches, member.branchIds)} ·{" "}
                {productSummary(member.productIds)}
              </div>
            </div>
            {member.isPrimaryOwner ? (
              <span className="merchant-manage-role-static">{ROLE_LABELS.owner}</span>
            ) : (
              <div className="merchant-manage-item-actions">
                <button
                  type="button"
                  className="merchant-manage-edit"
                  aria-label={`Edit ${member.name || member.email}`}
                  onClick={() => setEditingMember(member)}
                >
                  <Pencil size={15} strokeWidth={2.3} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="merchant-manage-form merchant-invite-form">
          <p className="merchant-invite-form-label">New invite</p>

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              value={email}
              placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <RolePicker value={inviteRole} onChange={setInviteRole} />

          {inviteRole !== "owner" ? (
            <div className="merchant-invite-access">
              <BranchAccessPicker branches={branches} selected={branchIds} onChange={setBranchIds} />
              <ProductAccessPicker selected={productIds} onChange={setProductIds} />
            </div>
          ) : (
            <p className="merchant-field-hint">Owners can access every branch and product.</p>
          )}

          <div className="merchant-manage-form-actions">
            <button
              type="button"
              className="merchant-action-btn merchant-action-btn--reject"
              onClick={resetInvite}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              onClick={() => void invite()}
              disabled={busy || !email.trim()}
            >
              {busy ? "Inviting…" : "Send invite"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="merchant-manage-add" onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={2.4} />
          Invite member
        </button>
      )}

      <MemberEditSheet
        member={editingMember}
        branches={branches}
        onSave={onUpdateMemberRole}
        onRemove={onRemoveMember}
        onClose={() => setEditingMember(null)}
      />
    </div>
  );
}

function RolePicker({
  value,
  onChange,
}: {
  value: MemberRole;
  onChange: (role: MemberRole) => void;
}) {
  return (
    <div className="auth-field">
      <span className="auth-label">Role</span>
      <div className="merchant-role-segment" role="radiogroup" aria-label="Role">
        {ASSIGNABLE_ROLES.map((role) => {
          const selected = value === role;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`merchant-role-segment-btn${selected ? " is-selected" : ""}`}
              onClick={() => onChange(role)}
            >
              {ROLE_LABELS[role]}
            </button>
          );
        })}
      </div>
      <span className="merchant-field-hint">{ROLE_HINTS[value]}</span>
    </div>
  );
}

function BranchAccessPicker({
  branches,
  selected,
  onChange,
}: {
  branches: Branch[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const allBranches = selected.length === 0;
  const showAllOption = branches.length > 1;
  const [detailOpen, setDetailOpen] = useState(() => selected.length > 0);
  const showDetails = !showAllOption ? false : !allBranches || detailOpen;

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    // Empty selection means "all" — keep at least one when customizing.
    if (next.length === 0) {
      onChange([]);
      setDetailOpen(false);
      return;
    }
    onChange(next);
    setDetailOpen(true);
  };

  if (!showAllOption) {
    const only = branches[0];
    return (
      <div className="auth-field merchant-access-field">
        <span className="auth-label">Branch access</span>
        <p className="merchant-access-static">
          {only?.name ?? "1 branch"}
          {only?.isDefault ? " · Main" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="auth-field merchant-access-field">
      <span className="auth-label">Branch access</span>
      <div className="branch-access-picker">
        <button
          type="button"
          className={`branch-access-option${allBranches ? " is-selected" : ""}`}
          onClick={() => {
            onChange([]);
            setDetailOpen(false);
          }}
        >
          <span className="branch-access-check">
            {allBranches ? <Check size={13} strokeWidth={3} /> : null}
          </span>
          <span className="branch-access-name">All branches</span>
        </button>

        {showDetails
          ? branches.map((b) => {
              const on = selected.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`branch-access-option${on ? " is-selected" : ""}`}
                  onClick={() => toggle(b.id)}
                >
                  <span className="branch-access-check">
                    {on ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span className="branch-access-name">{b.name}</span>
                  {b.isDefault && <span className="merchant-manage-tag">Main</span>}
                </button>
              );
            })
          : (
            <button
              type="button"
              className="merchant-access-customize"
              onClick={() => setDetailOpen(true)}
            >
              Limit to specific branches
            </button>
          )}
      </div>
    </div>
  );
}

function ProductAccessPicker({
  selected,
  onChange,
}: {
  selected: MerchantProduct[];
  onChange: (ids: MerchantProduct[]) => void;
}) {
  const allProducts = selected.length === 0;
  const [detailOpen, setDetailOpen] = useState(() => selected.length > 0);
  const showDetails = !allProducts || detailOpen;

  const toggle = (id: MerchantProduct) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    if (next.length === 0) {
      onChange([]);
      setDetailOpen(false);
      return;
    }
    onChange(next);
    setDetailOpen(true);
  };

  return (
    <div className="auth-field merchant-access-field">
      <span className="auth-label">Product access</span>
      <div className="branch-access-picker">
        <button
          type="button"
          className={`branch-access-option${allProducts ? " is-selected" : ""}`}
          onClick={() => {
            onChange([]);
            setDetailOpen(false);
          }}
        >
          <span className="branch-access-check">
            {allProducts ? <Check size={13} strokeWidth={3} /> : null}
          </span>
          <span className="branch-access-name">All products</span>
        </button>

        {showDetails
          ? PRODUCTS.map((product) => {
              const on = selected.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  className={`branch-access-option${on ? " is-selected" : ""}`}
                  onClick={() => toggle(product.id)}
                >
                  <span className="branch-access-check">
                    {on ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span className="branch-access-name">{product.name}</span>
                </button>
              );
            })
          : (
            <button
              type="button"
              className="merchant-access-customize"
              onClick={() => setDetailOpen(true)}
            >
              Limit to specific products
            </button>
          )}
      </div>
    </div>
  );
}

function MemberEditSheet({
  member,
  branches,
  onSave,
  onRemove,
  onClose,
}: {
  member: MerchantMember | null;
  branches: Branch[];
  onSave: (
    id: string,
    role: MemberRole,
    branchIds?: string[],
    productIds?: MerchantProduct[],
  ) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={member !== null}
      onClose={onClose}
      labelledBy="member-edit-title"
      className="merchant-theme merchant-edit-drawer"
    >
      {member && (
        <MemberEditBody
          key={member.id}
          member={member}
          branches={branches}
          onSave={onSave}
          onRemove={onRemove}
          onClose={onClose}
        />
      )}
    </BottomSheet>
  );
}

function MemberEditBody({
  member,
  branches,
  onSave,
  onRemove,
  onClose,
}: {
  member: MerchantMember;
  branches: Branch[];
  onSave: (
    id: string,
    role: MemberRole,
    branchIds?: string[],
    productIds?: MerchantProduct[],
  ) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [role, setRole] = useState<MemberRole>(
    member.role === "owner" || member.role === "manager" ? member.role : "staff",
  );
  const [branchIds, setBranchIds] = useState<string[]>(member.branchIds);
  const [productIds, setProductIds] = useState<MerchantProduct[]>(member.productIds);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await onSave(
      member.id,
      role,
      role === "owner" ? [] : branchIds,
      role === "owner" ? [] : productIds,
    );
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    setBusy(true);
    const ok = await onRemove(member.id);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="merchant-edit-sheet merchant-manage-sheet">
      <div className="merchant-edit-sheet-head merchant-manage-sheet-head">
        <div className="merchant-manage-item-icon merchant-manage-item-icon--avatar wizard-form-icon">
          {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="merchant-manage-sheet-copy">
          <h3 id="member-edit-title" className="merchant-edit-sheet-title">
            {member.name || member.email}
          </h3>
          <p className="merchant-edit-sheet-sub">{member.email}</p>
        </div>
      </div>

      <div className="merchant-edit-fields">
        <RolePicker value={role} onChange={setRole} />
        {role !== "owner" ? (
          <div className="merchant-invite-access">
            <BranchAccessPicker branches={branches} selected={branchIds} onChange={setBranchIds} />
            <ProductAccessPicker selected={productIds} onChange={setProductIds} />
          </div>
        ) : (
          <p className="merchant-field-hint">Owners can access every branch and product.</p>
        )}
      </div>

      {confirmingDelete ? (
        <div className="merchant-manage-confirm">
          <div className="merchant-manage-confirm-copy">
            <div className="merchant-manage-item-name">Remove {member.name || member.email}?</div>
            <div className="merchant-manage-item-sub">
              They&apos;ll immediately lose access to this store. This can&apos;t be undone.
            </div>
          </div>
          <div className="merchant-manage-form-actions">
            <button
              type="button"
              className="merchant-action-btn merchant-action-btn--reject"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cta-btn merchant-cta-danger"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy ? "Removing…" : "Remove member"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="merchant-manage-form-actions">
            <button
              type="button"
              className="merchant-action-btn merchant-action-btn--reject"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
          <button
            type="button"
            className="merchant-member-remove-link"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            <Trash2 size={15} strokeWidth={2.3} />
            Remove from team
          </button>
        </>
      )}
    </div>
  );
}
