"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Copy,
  Lock,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import {
  maxActiveBranchesForProduct,
} from "@/lib/merchant/branch-assignments";
import { planUpgradeSummary } from "@/lib/merchant/plan-summary";
import type { Branch, MerchantProduct } from "@/lib/merchant/types";

interface ProductBranchesPanelProps {
  product: MerchantProduct;
  branches: Branch[];
  activeBranchIds: string[];
  maxActive: number;
  planId?: string | null;
  canManage?: boolean;
  onToggle: (branchId: string) => Promise<void> | void;
  onCreateBranch: () => void;
  onUpgrade?: () => void;
  onEditBranch?: (branchId: string) => void;
  onRenameBranch?: (branchId: string) => void;
  onCopyQr?: (branchId: string) => void;
  onDeleteBranch?: (branchId: string) => void;
  busyBranchId?: string | null;
}

export function ProductBranchesPanel({
  product,
  branches,
  activeBranchIds,
  maxActive,
  planId = null,
  canManage = false,
  onToggle,
  onCreateBranch,
  onUpgrade,
  onEditBranch,
  onRenameBranch,
  onCopyQr,
  onDeleteBranch,
  busyBranchId = null,
}: ProductBranchesPanelProps) {
  const activeSet = new Set(activeBranchIds);
  const selectedCount = activeBranchIds.length;
  const atLimit = selectedCount >= maxActive;
  const usagePct = Math.min(100, Math.round((selectedCount / Math.max(maxActive, 1)) * 100));

  const selected = branches.filter((b) => activeSet.has(b.id));
  // Single-slot plans can swap without upgrading — only multi-slot caps lock.
  const available = branches.filter(
    (b) => !activeSet.has(b.id) && (!atLimit || maxActive === 1),
  );
  const locked = branches.filter(
    (b) => !activeSet.has(b.id) && atLimit && maxActive > 1,
  );
  const others = [...available, ...locked];
  const hasUnselected = others.length > 0;

  const summary = planUpgradeSummary({ product, planId });
  const next = summary.nextPlan;
  const nextMax = next
    ? maxActiveBranchesForProduct(product, {
        product,
        planId: next.id,
        status: "active",
        onboarded: true,
        pendingPlanId: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        trialStartedAt: null,
        trialEndsAt: null,
      })
    : null;

  const showUpgrade =
    atLimit && hasUnselected && Boolean(next) && canManage && Boolean(onUpgrade);
  const [menuBranchId, setMenuBranchId] = useState<string | null>(null);

  if (branches.length === 0) {
    return (
      <div className="merchant-settings-group product-branches">
        <h3 className="merchant-settings-title">Branches</h3>
        <div className="panel-card product-branches-shell">
          <div className="product-branches-empty-card">
            <div className="product-branches-empty-art" aria-hidden>
              <MapPin size={28} strokeWidth={2} />
            </div>
            <p className="product-branches-empty-title">Create your first branch</p>
            <p className="product-branches-empty-sub">
              Branches let you manage multiple business locations independently.
            </p>
            {canManage ? (
              <button
                type="button"
                className="cta-btn merchant-cta-accent product-branches-empty-cta"
                onClick={onCreateBranch}
              >
                Create Branch
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-settings-group product-branches">
      <h3 className="merchant-settings-title">Branches</h3>

      <div className="panel-card product-branches-shell">
        <div className="product-branches-top">
          <div className="product-branches-top-copy">
            <div className="product-branches-meter">
              <div className="product-branches-meter-labels">
                <span>Active Branches</span>
                <span>
                  {selectedCount} / {maxActive} Used
                </span>
              </div>
              <div
                className="product-branches-meter-track"
                role="progressbar"
                aria-valuenow={selectedCount}
                aria-valuemin={0}
                aria-valuemax={maxActive}
              >
                <div
                  className={`product-branches-meter-fill${atLimit ? " is-full" : ""}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          </div>
          {canManage ? (
            <button type="button" className="product-branches-new" onClick={onCreateBranch}>
              <Plus size={15} strokeWidth={2.5} aria-hidden />
              New Branch
            </button>
          ) : null}
        </div>

        <div className="product-branches-body">
          {selected.length > 0 ? (
            <section className="product-branches-section">
              <h4 className="product-branches-section-title">
                {selected.length === 1 ? "Selected Branch" : "Selected Branches"}
              </h4>
              <div className="product-branches-stack">
                {selected.map((branch) => (
                  <BranchCard
                    key={branch.id}
                    branch={branch}
                    state="selected"
                    busy={busyBranchId === branch.id}
                    canManage={canManage}
                    menuOpen={menuBranchId === branch.id}
                    onOpenMenu={() =>
                      setMenuBranchId((id) => (id === branch.id ? null : branch.id))
                    }
                    onCloseMenu={() => setMenuBranchId(null)}
                    onSelect={() => void onToggle(branch.id)}
                    onEdit={onEditBranch}
                    onRename={onRenameBranch}
                    onCopyQr={onCopyQr}
                    onDelete={onDeleteBranch}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {others.length > 0 ? (
            <section className="product-branches-section">
              <h4 className="product-branches-section-title">Other Branches</h4>
              <div className="product-branches-stack">
                {available.map((branch) => (
                  <BranchCard
                    key={branch.id}
                    branch={branch}
                    state="available"
                    busy={busyBranchId === branch.id}
                    canManage={canManage}
                    menuOpen={menuBranchId === branch.id}
                    onOpenMenu={() =>
                      setMenuBranchId((id) => (id === branch.id ? null : branch.id))
                    }
                    onCloseMenu={() => setMenuBranchId(null)}
                    onSelect={() => void onToggle(branch.id)}
                    onEdit={onEditBranch}
                    onRename={onRenameBranch}
                    onCopyQr={onCopyQr}
                    onDelete={onDeleteBranch}
                  />
                ))}
                {locked.map((branch) => (
                  <BranchCard
                    key={branch.id}
                    branch={branch}
                    state="locked"
                    busy={false}
                    canManage={canManage}
                    menuOpen={menuBranchId === branch.id}
                    lockHint={
                      next
                        ? `Requires ${next.name} Plan`
                        : "Upgrade to activate this branch"
                    }
                    onOpenMenu={() =>
                      setMenuBranchId((id) => (id === branch.id ? null : branch.id))
                    }
                    onCloseMenu={() => setMenuBranchId(null)}
                    onSelect={() => onUpgrade?.()}
                    onEdit={onEditBranch}
                    onRename={onRenameBranch}
                    onCopyQr={onCopyQr}
                    onDelete={onDeleteBranch}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {showUpgrade && next ? (
          <div className="product-branches-upgrade-card">
            <p className="product-branches-upgrade-title">Need more branches?</p>
            <p className="product-branches-upgrade-body">
              Your current plan allows {maxActive} active{" "}
              {maxActive === 1 ? "branch" : "branches"}.
              {nextMax != null
                ? ` Upgrade to ${next.name} to activate up to ${nextMax} branches.`
                : ` Upgrade to ${next.name} to activate more.`}
            </p>
            <button
              type="button"
              className="product-branches-upgrade-cta"
              onClick={onUpgrade}
            >
              Upgrade Plan
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BranchCard({
  branch,
  state,
  busy,
  canManage,
  menuOpen,
  lockHint,
  onOpenMenu,
  onCloseMenu,
  onSelect,
  onEdit,
  onRename,
  onCopyQr,
  onDelete,
}: {
  branch: Branch;
  state: "selected" | "available" | "locked";
  busy: boolean;
  canManage: boolean;
  menuOpen: boolean;
  lockHint?: string;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onSelect: () => void;
  onEdit?: (branchId: string) => void;
  onRename?: (branchId: string) => void;
  onCopyQr?: (branchId: string) => void;
  onDelete?: (branchId: string) => void;
}) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onCloseMenu();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, onCloseMenu]);

  return (
    <div
      className={`product-branch-card is-${state}${busy ? " is-busy" : ""}`}
    >
      <button
        type="button"
        className="product-branch-card-main"
        disabled={busy || (!canManage && state !== "locked")}
        aria-pressed={state === "selected"}
        onClick={() => {
          if (busy) return;
          if (state === "locked") {
            onSelect();
            return;
          }
          if (!canManage) return;
          onSelect();
        }}
      >
        <span
          className={`product-branch-radio${state === "selected" ? " is-on" : ""}${
            state === "locked" ? " is-locked" : ""
          }`}
          aria-hidden
        >
          {state === "locked" ? <Lock size={12} strokeWidth={2.4} /> : null}
        </span>
        <span className="product-branch-card-copy">
          <span className="product-branch-card-row">
            <span className="product-branch-card-name">{branch.name}</span>
            {state === "selected" ? (
              <span className="product-branch-badge is-selected">Selected</span>
            ) : null}
            {state === "locked" ? (
              <span className="product-branch-badge is-locked">Locked</span>
            ) : null}
          </span>
          {branch.address ? (
            <span className="product-branch-card-address">{branch.address}</span>
          ) : null}
          {state === "locked" && lockHint ? (
            <span className="product-branch-card-hint">{lockHint}</span>
          ) : null}
        </span>
      </button>

      {canManage ? (
        <div className="product-branch-menu" ref={menuRef}>
          <button
            type="button"
            className="product-branch-menu-trigger"
            aria-label={`Actions for ${branch.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu();
            }}
          >
            <MoreVertical size={16} strokeWidth={2.2} />
          </button>
          {menuOpen ? (
            <div id={menuId} role="menu" className="product-branch-menu-pop">
              {onEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  className="product-branch-menu-item"
                  onClick={() => {
                    onCloseMenu();
                    onEdit(branch.id);
                  }}
                >
                  <Pencil size={14} strokeWidth={2.2} />
                  Edit Branch
                </button>
              ) : null}
              {onRename ? (
                <button
                  type="button"
                  role="menuitem"
                  className="product-branch-menu-item"
                  onClick={() => {
                    onCloseMenu();
                    onRename(branch.id);
                  }}
                >
                  <Type size={14} strokeWidth={2.2} />
                  Rename
                </button>
              ) : null}
              {onCopyQr ? (
                <button
                  type="button"
                  role="menuitem"
                  className="product-branch-menu-item"
                  onClick={() => {
                    onCloseMenu();
                    onCopyQr(branch.id);
                  }}
                >
                  <Copy size={14} strokeWidth={2.2} />
                  Copy QR Link
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className="product-branch-menu-item is-danger"
                  onClick={() => {
                    onCloseMenu();
                    onDelete(branch.id);
                  }}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
