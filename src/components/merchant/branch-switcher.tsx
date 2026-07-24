"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MapPin, Plus, Store } from "lucide-react";
import type { Branch } from "@/lib/merchant/types";

interface BranchSwitcherProps {
  branches: Branch[];
  activeBranch: Branch | null;
  canManage: boolean;
  /** Owners (and staff with full access) can view a combined all-branches mode. */
  allowAllBranches?: boolean;
  onSelect: (branchId: string | null) => void | Promise<void>;
  onAddBranch: () => void;
}

export function BranchSwitcher({
  branches,
  activeBranch,
  canManage,
  allowAllBranches = true,
  onSelect,
  onAddBranch,
}: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const label = activeBranch ? activeBranch.name : allowAllBranches ? "All branches" : "Branch";
  // With a single branch there's nothing to switch between.
  const hasChoices = allowAllBranches ? branches.length > 1 : branches.length > 1;

  const pick = (branchId: string | null) => {
    setOpen(false);
    void onSelect(branchId);
  };

  return (
    <div className="branch-switcher" ref={ref}>
      <button
        type="button"
        className="branch-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!hasChoices && !canManage}
        onClick={() => setOpen((v) => !v)}
      >
        <MapPin size={13} strokeWidth={2.4} className="branch-switcher-pin" />
        <span className="branch-switcher-label">{label}</span>
        {(hasChoices || canManage) && (
          <ChevronDown size={14} strokeWidth={2.4} className="branch-switcher-caret" />
        )}
      </button>

      {open && (
        <div className="branch-switcher-menu" role="listbox">
          {allowAllBranches && branches.length > 1 && (
            <button
              type="button"
              role="option"
              aria-selected={activeBranch === null}
              className={`branch-switcher-item${activeBranch === null ? " is-active" : ""}`}
              onClick={() => pick(null)}
            >
              <span className="branch-switcher-item-icon">
                <Store size={15} strokeWidth={2.2} />
              </span>
              <span className="branch-switcher-item-copy">
                <span className="branch-switcher-item-name">All branches</span>
                <span className="branch-switcher-item-sub">Combined view</span>
              </span>
              {activeBranch === null && <Check size={15} strokeWidth={2.6} />}
            </button>
          )}

          {branches.map((branch) => {
            const isActive = activeBranch?.id === branch.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`branch-switcher-item${isActive ? " is-active" : ""}`}
                onClick={() => pick(branch.id)}
              >
                <span className="branch-switcher-item-icon">
                  <MapPin size={15} strokeWidth={2.2} />
                </span>
                <span className="branch-switcher-item-copy">
                  <span className="branch-switcher-item-name">{branch.name}</span>
                  {branch.address && (
                    <span className="branch-switcher-item-sub">{branch.address}</span>
                  )}
                </span>
                {isActive && <Check size={15} strokeWidth={2.6} />}
              </button>
            );
          })}

          {canManage && (
            <button
              type="button"
              className="branch-switcher-add"
              onClick={() => {
                setOpen(false);
                onAddBranch();
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              Add branch
            </button>
          )}
        </div>
      )}
    </div>
  );
}
