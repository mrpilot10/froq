"use client";

import { useState } from "react";
import { ChevronDown, Check, MapPin, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import type { Branch, MemberRole, MerchantMember } from "@/lib/merchant/types";

interface BranchesTeamDrawerProps {
  view: "branches" | "team" | null;
  branches: Branch[];
  members: MerchantMember[];
  role: MemberRole;
  onCreateBranch: (input: { name: string; address?: string }) => Promise<string | null>;
  onUpdateBranch: (id: string, patch: { name?: string; address?: string }) => Promise<boolean>;
  onDeleteBranch: (id: string) => Promise<boolean>;
  onInviteMember: (input: {
    email: string;
    name?: string;
    role: MemberRole;
    branchIds?: string[];
  }) => Promise<boolean>;
  onUpdateMemberRole: (id: string, role: MemberRole, branchIds?: string[]) => Promise<boolean>;
  onRemoveMember: (id: string) => Promise<boolean>;
  onClose: () => void;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  staff: "Staff",
};

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
  role,
  onCreateBranch,
  onUpdateBranch,
  onDeleteBranch,
  onInviteMember,
}: BranchesTeamDrawerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const canInvite = role === "owner";

  const resetForm = () => {
    setName("");
    setAddress("");
    setInviteOpen(false);
    setInviteEmail("");
    setAdding(false);
  };

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const branchId = await onCreateBranch({
      name: name.trim(),
      address: address.trim() || undefined,
    });
    // Optionally invite a teammate scoped to the branch we just created.
    if (branchId && canInvite && inviteOpen && inviteEmail.trim()) {
      await onInviteMember({
        email: inviteEmail.trim(),
        role: "staff",
        branchIds: [branchId],
      });
    }
    setBusy(false);
    if (branchId) resetForm();
  };

  return (
    <div className="merchant-edit-sheet">
      <div className="merchant-edit-sheet-head">
        <div className="wizard-form-icon">
          <MapPin size={22} strokeWidth={2.2} />
        </div>
        <h3 id="manage-title" className="merchant-edit-sheet-title">
          Branches
        </h3>
        <p className="merchant-edit-sheet-sub">
          Each branch gets its own QR, customers, and analytics. Switch branches from the header.
        </p>
      </div>

      <div className="merchant-manage-list">
        {branches.map((branch) => (
          <BranchRow
            key={branch.id}
            branch={branch}
            onSave={(patch) => onUpdateBranch(branch.id, patch)}
            onDelete={() => onDeleteBranch(branch.id)}
          />
        ))}
      </div>

      {adding ? (
        <div className="merchant-manage-form">
          <label className="auth-field">
            <span className="auth-label">Branch name</span>
            <input
              className="auth-input"
              value={name}
              placeholder="Downtown"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">Address (optional)</span>
            <input
              className="auth-input"
              value={address}
              placeholder="42 Market Street"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

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
                  <p className="merchant-field-hint">
                    They&apos;ll join as staff with access to this branch.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="merchant-manage-form-actions">
            <button
              type="button"
              className="merchant-action-btn merchant-action-btn--reject"
              onClick={resetForm}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cta-btn merchant-cta-accent"
              onClick={() => void add()}
              disabled={busy || !name.trim()}
            >
              {busy ? "Adding…" : "Add branch"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="merchant-manage-add" onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={2.4} />
          Add branch
        </button>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  onSave,
  onDelete,
}: {
  branch: Branch;
  onSave: (patch: { name?: string; address?: string }) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await onSave({ name: name.trim(), address });
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
      <div className="merchant-manage-form">
        <label className="auth-field">
          <span className="auth-label">Branch name</span>
          <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="auth-field">
          <span className="auth-label">Address</span>
          <input
            className="auth-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <div className="merchant-manage-form-actions">
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cta-btn merchant-cta-accent"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
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
        {branch.address && (
          <div className="merchant-manage-item-sub">{branch.address}</div>
        )}
      </div>
      <div className="merchant-manage-item-actions">
        <button
          type="button"
          className="merchant-action-btn merchant-action-btn--reject"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        {!branch.isDefault && (
          <button
            type="button"
            className="merchant-logo-remove"
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
  if (branchIds.length === 0) return "All branches";
  if (branchIds.length === 1) {
    return branches.find((b) => b.id === branchIds[0])?.name ?? "1 branch";
  }
  return `${branchIds.length} branches`;
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
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingMember, setEditingMember] = useState<MerchantMember | null>(null);

  const resetInvite = () => {
    setEmail("");
    setBranchIds([]);
    setAdding(false);
  };

  const invite = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    const ok = await onInviteMember({
      email: email.trim(),
      role: "staff",
      branchIds,
    });
    setBusy(false);
    if (ok) resetInvite();
  };

  return (
    <div className="merchant-edit-sheet">
      <div className="merchant-edit-sheet-head">
        <div className="wizard-form-icon">
          <Users size={22} strokeWidth={2.2} />
        </div>
        <h3 id="manage-title" className="merchant-edit-sheet-title">
          Team
        </h3>
        <p className="merchant-edit-sheet-sub">
          Invite staff. They&apos;ll get an email to set a password.
        </p>
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
                {member.role !== "owner" && !member.joined && (
                  <span className="merchant-manage-tag merchant-manage-tag--pending">Invited</span>
                )}
                {member.role !== "owner" && member.joined && (
                  <span className="merchant-manage-tag merchant-manage-tag--joined">Joined</span>
                )}
              </div>
              <div className="merchant-manage-item-sub">
                {ROLE_LABELS[member.role]} · {branchSummary(branches, member.branchIds)}
              </div>
            </div>
            {member.role === "owner" ? (
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
        <div className="merchant-manage-form">
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
          <BranchAccessPicker branches={branches} selected={branchIds} onChange={setBranchIds} />
          <p className="merchant-field-hint">Invited members join as staff.</p>
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
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="auth-field">
      <span className="auth-label">Branch access</span>
      <div className="branch-access-picker">
        <button
          type="button"
          className={`branch-access-option${allBranches ? " is-selected" : ""}`}
          onClick={() => onChange([])}
        >
          <span className="branch-access-check">{allBranches && <Check size={13} strokeWidth={3} />}</span>
          <span className="branch-access-name">All branches</span>
        </button>
        {branches.map((b) => {
          const on = selected.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              className={`branch-access-option${on ? " is-selected" : ""}`}
              onClick={() => toggle(b.id)}
            >
              <span className="branch-access-check">{on && <Check size={13} strokeWidth={3} />}</span>
              <span className="branch-access-name">{b.name}</span>
              {b.isDefault && <span className="merchant-manage-tag">Main</span>}
            </button>
          );
        })}
      </div>
      <span className="merchant-field-hint">
        {allBranches ? "This person can access every branch." : "Only the selected branches."}
      </span>
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
  onSave: (id: string, role: MemberRole, branchIds?: string[]) => Promise<boolean>;
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
  onSave: (id: string, role: MemberRole, branchIds?: string[]) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [branchIds, setBranchIds] = useState<string[]>(member.branchIds);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await onSave(member.id, "staff", branchIds);
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
    <div className="merchant-edit-sheet">
      <div className="merchant-edit-sheet-head">
        <div className="merchant-manage-item-icon merchant-manage-item-icon--avatar wizard-form-icon">
          {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
        </div>
        <h3 id="member-edit-title" className="merchant-edit-sheet-title">
          {member.name || member.email}
        </h3>
        <p className="merchant-edit-sheet-sub">{member.email}</p>
      </div>

      <div className="merchant-edit-fields">
        <p className="merchant-field-hint" style={{ marginBottom: 4 }}>
          Role: Staff — day-to-day stamps, approvals &amp; queue.
        </p>
        <BranchAccessPicker branches={branches} selected={branchIds} onChange={setBranchIds} />
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
