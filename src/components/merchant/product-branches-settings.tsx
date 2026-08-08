"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { setProductBranchAssignments } from "@/app/merchant/actions";
import {
  activeBranchIdsForProduct,
  maxActiveBranches,
} from "@/lib/merchant/branch-assignments";
import type { Branch, MerchantProduct } from "@/lib/merchant/types";
import { joinUrlFor } from "@/components/merchant/use-merchant-qr";
import { useMerchantWorkspace } from "./merchant-workspace-context";
import { ProductBranchesPanel } from "./product-branches-panel";

/** When assignments exceed the plan cap (e.g. migration backfill), prefer the main branch. */
function clampActiveToPlan(
  activeIds: string[],
  branches: Branch[],
  maxActive: number,
): string[] {
  if (activeIds.length <= maxActive || maxActive <= 0) return activeIds;

  const main =
    branches.find((b) => b.isDefault) ??
    branches.find((b) => activeIds.includes(b.id)) ??
    branches[0] ??
    null;

  const next: string[] = [];
  if (main) next.push(main.id);

  for (const id of activeIds) {
    if (next.length >= maxActive) break;
    if (!next.includes(id)) next.push(id);
  }

  return next.slice(0, maxActive);
}

/**
 * Product settings: pick which global branches are active for this product.
 * Single-slot plans swap on pick; multi-slot plans toggle until the cap.
 */
export function ProductBranchesSettings({ product }: { product: MerchantProduct }) {
  const {
    profile,
    branches,
    productBranches,
    entitlements,
    role,
    onManageBranches,
    onPurchaseProduct,
    onRefresh,
    onUpdateBranch,
    onDeleteBranch,
  } = useMerchantWorkspace();
  const [busyBranchId, setBusyBranchId] = useState<string | null>(null);
  const clampingRef = useRef(false);
  const canManage = role === "owner";
  const activeBranchIds = activeBranchIdsForProduct(productBranches, product);
  const maxActive = maxActiveBranches(product, entitlements);
  const planId = entitlements[product]?.planId ?? null;

  const persist = async (nextIds: string[], busyId: string) => {
    setBusyBranchId(busyId);
    try {
      const res = await setProductBranchAssignments({
        product,
        branchIds: nextIds,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not update branches");
        return false;
      }
      await onRefresh();
      return true;
    } finally {
      setBusyBranchId(null);
    }
  };

  // Backfill / plan changes can leave more actives than the cap — keep the main branch.
  useEffect(() => {
    if (!canManage || clampingRef.current) return;
    if (activeBranchIds.length <= maxActive) return;

    const next = clampActiveToPlan(activeBranchIds, branches, maxActive);
    if (
      next.length === activeBranchIds.length &&
      next.every((id, i) => id === activeBranchIds[i])
    ) {
      return;
    }

    clampingRef.current = true;
    void persist(next, next[0] ?? "clamp").finally(() => {
      clampingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp once when over cap
  }, [activeBranchIds, maxActive, branches, canManage, product]);

  const toggle = async (branchId: string) => {
    const selected = activeBranchIds.includes(branchId);

    if (selected) {
      // Keep at least one selection on single-slot plans (radio behavior).
      if (maxActive === 1) return;
      await persist(
        activeBranchIds.filter((id) => id !== branchId),
        branchId,
      );
      return;
    }

    if (activeBranchIds.length < maxActive) {
      await persist([...activeBranchIds, branchId], branchId);
      return;
    }

    if (maxActive === 1) {
      await persist([branchId], branchId);
      return;
    }

    toast.message(`Deselect a location first — your plan allows ${maxActive}.`);
  };

  const rename = async (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;
    const next = window.prompt("Rename branch", branch.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === branch.name) return;
    const ok = await onUpdateBranch(branchId, { name });
    if (ok) toast.success("Branch renamed");
  };

  const copyQr = async (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;
    const url = joinUrlFor(profile, product, branch.slug);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("QR link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const remove = async (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;
    if (branch.isDefault) {
      toast.error("The main branch can’t be deleted.");
      return;
    }
    if (
      !window.confirm(
        `Delete “${branch.name}”? Its QR stops working and this can’t be undone.`,
      )
    ) {
      return;
    }
    await onDeleteBranch(branchId);
  };

  // While over the plan (before clamp finishes), show the clamped selection.
  const displayActiveIds =
    activeBranchIds.length > maxActive
      ? clampActiveToPlan(activeBranchIds, branches, maxActive)
      : activeBranchIds;

  return (
    <ProductBranchesPanel
      product={product}
      branches={branches}
      activeBranchIds={displayActiveIds}
      maxActive={maxActive}
      planId={planId}
      canManage={canManage}
      busyBranchId={busyBranchId}
      onToggle={toggle}
      onCreateBranch={onManageBranches}
      onUpgrade={canManage ? () => onPurchaseProduct(product) : undefined}
      onEditBranch={canManage ? () => onManageBranches() : undefined}
      onRenameBranch={canManage ? rename : undefined}
      onCopyQr={canManage ? copyQr : undefined}
      onDeleteBranch={canManage ? remove : undefined}
    />
  );
}
