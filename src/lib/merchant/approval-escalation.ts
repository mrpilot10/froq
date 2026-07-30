import type { MemberRole, MerchantProduct } from "./types";

/** Fixed escalation windows for pending stamp approvals. */
export const STAFF_ESCALATION_HOURS = 3;
export const MANAGER_ESCALATION_HOURS = 6;

export type ApprovalEscalationLevel = "3h" | "6h";

export function escalationHours(level: ApprovalEscalationLevel): number {
  return level === "3h" ? STAFF_ESCALATION_HOURS : MANAGER_ESCALATION_HOURS;
}

export const ESCALATION_TITLE = "Pending Stamp Approvals";
export const ESCALATION_ACTION_LABEL = "Review Pending Approvals";

/** Deep link to the loyalty pending-approvals home. */
export function pendingApprovalsHref(): string {
  return "/merchant/loyalty?tab=approvals";
}

/**
 * Count copy for the reminder — total pending in the recipient's scope,
 * not only the overdue subset that triggered the escalation.
 */
export function pendingApprovalsMessage(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 1) return "1 customer is waiting for stamp approval.";
  return `${n} customers are waiting for stamp approval.`;
}

/**
 * Branch ACL: empty branch_ids (and no legacy branch_id) = all branches.
 * Approvals with no branch_id are visible to every teammate with product access.
 */
export function memberHasBranchAccess(
  branchIds: string[],
  legacyBranchId: string | null | undefined,
  approvalBranchId: string | null,
): boolean {
  if (!approvalBranchId) return true;
  const ids =
    branchIds.length > 0
      ? branchIds
      : legacyBranchId
        ? [legacyBranchId]
        : [];
  if (ids.length === 0) return true;
  return ids.includes(approvalBranchId);
}

/** Product ACL: empty productIds = all products. Escalations always target loyalty. */
export function memberHasProductAccess(
  role: MemberRole,
  productIds: readonly string[] | null | undefined,
  product: MerchantProduct = "loyalty",
): boolean {
  if (role === "owner") return true;
  if (!productIds || productIds.length === 0) return true;
  return productIds.includes(product);
}

/** Resolve effective branch id list (empty = all). */
export function effectiveBranchIds(
  branchIds: string[] | null | undefined,
  legacyBranchId: string | null | undefined,
): string[] {
  if (branchIds && branchIds.length > 0) return branchIds;
  if (legacyBranchId) return [legacyBranchId];
  return [];
}
