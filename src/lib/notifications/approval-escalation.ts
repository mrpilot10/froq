import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/app-url";
import { sendPendingApprovalsEscalationEmail } from "@/lib/email/resend";
import {
  ESCALATION_ACTION_LABEL,
  ESCALATION_TITLE,
  MANAGER_ESCALATION_HOURS,
  STAFF_ESCALATION_HOURS,
  effectiveBranchIds,
  memberHasBranchAccess,
  memberHasProductAccess,
  pendingApprovalsHref,
  pendingApprovalsMessage,
  type ApprovalEscalationLevel,
} from "@/lib/merchant/approval-escalation";
import type { MemberRole } from "@/lib/merchant/types";

export interface ApprovalEscalationResult {
  scanned: number;
  notified: number;
  skipped: number;
  failed: number;
}

interface PendingApprovalRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  requested_at: string;
  status: string;
}

interface MemberRow {
  user_id: string;
  role: MemberRole;
  email: string | null;
  name: string | null;
  branch_ids: string[] | null;
  branch_id: string | null;
  product_ids: string[] | null;
  accepted_at: string | null;
}

interface MerchantToggles {
  id: string;
  business_name: string;
  owner_user_id: string;
  email: string | null;
  notify_staff_pending_approvals: boolean | null;
  notify_manager_pending_approvals: boolean | null;
  notify_owner_pending_approvals: boolean | null;
}

interface EscalationSendRow {
  user_id: string;
  escalation_level: ApprovalEscalationLevel;
  anchor_approval_id: string;
}

interface Recipient {
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  branchIds: string[];
  legacyBranchId: string | null;
  productIds: string[];
}

function jobLog(
  level: "info" | "error" | "warn",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = {
    scope: "approval_escalation",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

function normalizeRole(role: string | null | undefined): MemberRole {
  if (role === "owner") return "owner";
  if (role === "manager") return "manager";
  return "staff";
}

function cutoffIso(hours: number, nowMs: number): string {
  return new Date(nowMs - hours * 60 * 60 * 1000).toISOString();
}

function pendingInRecipientScope(
  pending: PendingApprovalRow[],
  recipient: Recipient,
): PendingApprovalRow[] {
  return pending.filter((row) =>
    memberHasBranchAccess(recipient.branchIds, recipient.legacyBranchId, row.branch_id),
  );
}

function oldestOverdue(
  pending: PendingApprovalRow[],
  cutoff: string,
): PendingApprovalRow | null {
  let oldest: PendingApprovalRow | null = null;
  for (const row of pending) {
    if (row.requested_at > cutoff) continue;
    if (!oldest || row.requested_at < oldest.requested_at) oldest = row;
  }
  return oldest;
}

function reviewUrlAbsolute(): string {
  try {
    return `${getAppOrigin()}${pendingApprovalsHref()}`;
  } catch {
    return `https://froq.io${pendingApprovalsHref()}`;
  }
}

/**
 * Escalate pending stamp approvals:
 * - ≥1 pending older than 3h → staff (+ owners if toggled)
 * - ≥1 pending older than 6h → managers (+ owners if toggled)
 * Message count = all pending in the recipient's branch/product scope.
 * One send per user × level until the oldest-overdue anchor is no longer pending.
 */
export async function processApprovalEscalationReminders(): Promise<ApprovalEscalationResult> {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const staffCutoff = cutoffIso(STAFF_ESCALATION_HOURS, nowMs);
  const managerCutoff = cutoffIso(MANAGER_ESCALATION_HOURS, nowMs);

  const result: ApprovalEscalationResult = {
    scanned: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
  };

  // Any pending older than the staff window is enough to scan that merchant.
  const { data: overdueRows, error: overdueError } = await admin
    .from("approvals")
    .select("id, merchant_id, branch_id, requested_at, status")
    .eq("status", "pending")
    .lte("requested_at", staffCutoff)
    .order("requested_at", { ascending: true })
    .limit(500);

  if (overdueError) {
    jobLog("error", "overdue_query_failed", { error: overdueError.message });
    throw new Error(overdueError.message);
  }

  const overdue = (overdueRows ?? []) as PendingApprovalRow[];
  result.scanned = overdue.length;
  if (overdue.length === 0) {
    jobLog("info", "tick_complete", { ...result });
    return result;
  }

  const merchantIds = [...new Set(overdue.map((r) => r.merchant_id))];

  for (const merchantId of merchantIds) {
    try {
      await processMerchantEscalations({
        admin,
        merchantId,
        staffCutoff,
        managerCutoff,
        result,
      });
    } catch (error) {
      result.failed += 1;
      jobLog("error", "merchant_failed", {
        merchantId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  jobLog("info", "tick_complete", { ...result, merchants: merchantIds.length });
  return result;
}

async function processMerchantEscalations(input: {
  admin: ReturnType<typeof createAdminClient>;
  merchantId: string;
  staffCutoff: string;
  managerCutoff: string;
  result: ApprovalEscalationResult;
}) {
  const { admin, merchantId, staffCutoff, managerCutoff, result } = input;

  const [merchantRes, membersRes, pendingRes, sendsRes] = await Promise.all([
    admin
      .from("merchants")
      .select(
        "id, business_name, owner_user_id, email, notify_staff_pending_approvals, notify_manager_pending_approvals, notify_owner_pending_approvals",
      )
      .eq("id", merchantId)
      .maybeSingle(),
    admin
      .from("merchant_members")
      .select(
        "user_id, role, email, name, branch_ids, branch_id, product_ids, accepted_at",
      )
      .eq("merchant_id", merchantId)
      .not("accepted_at", "is", null),
    admin
      .from("approvals")
      .select("id, merchant_id, branch_id, requested_at, status")
      .eq("merchant_id", merchantId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(1000),
    admin
      .from("approval_escalation_sends")
      .select("user_id, escalation_level, anchor_approval_id")
      .eq("merchant_id", merchantId),
  ]);

  const merchant = merchantRes.data as MerchantToggles | null;
  if (!merchant) {
    result.skipped += 1;
    return;
  }

  const pending = (pendingRes.data ?? []) as PendingApprovalRow[];
  if (pending.length === 0) {
    // Nothing pending — clear wave markers for this merchant.
    await admin.from("approval_escalation_sends").delete().eq("merchant_id", merchantId);
    result.skipped += 1;
    return;
  }

  const members = ((membersRes.data ?? []) as MemberRow[]).map((m) => ({
    ...m,
    role: normalizeRole(m.role),
  }));
  const sends = (sendsRes.data ?? []) as EscalationSendRow[];
  const sendByKey = new Map<string, EscalationSendRow>();
  for (const s of sends) {
    sendByKey.set(`${s.user_id}:${s.escalation_level}`, s);
  }
  const pendingIds = new Set(pending.map((p) => p.id));

  const notifyStaff = merchant.notify_staff_pending_approvals !== false;
  const notifyManager = merchant.notify_manager_pending_approvals !== false;
  const notifyOwner = merchant.notify_owner_pending_approvals === true;

  const recipients = buildRecipients(members, merchant);

  const levels: Array<{
    level: ApprovalEscalationLevel;
    cutoff: string;
    includeRoles: MemberRole[];
    roleToggleOn: boolean;
  }> = [
    {
      level: "3h",
      cutoff: staffCutoff,
      includeRoles: ["staff"],
      roleToggleOn: notifyStaff,
    },
    {
      level: "6h",
      cutoff: managerCutoff,
      includeRoles: ["manager"],
      roleToggleOn: notifyManager,
    },
  ];

  for (const { level, cutoff, includeRoles, roleToggleOn } of levels) {
    for (const recipient of recipients) {
      const roleMatches =
        includeRoles.includes(recipient.role) ||
        (notifyOwner && recipient.role === "owner");
      if (!roleMatches) {
        result.skipped += 1;
        continue;
      }
      // Owners ride along only when their toggle is on; staff/manager need their toggles.
      if (recipient.role === "owner") {
        if (!notifyOwner) {
          result.skipped += 1;
          continue;
        }
      } else if (!roleToggleOn) {
        result.skipped += 1;
        continue;
      }

      if (!memberHasProductAccess(recipient.role, recipient.productIds, "loyalty")) {
        result.skipped += 1;
        continue;
      }

      const scoped = pendingInRecipientScope(pending, recipient);
      const anchor = oldestOverdue(scoped, cutoff);

      const key = `${recipient.userId}:${level}`;
      const existing = sendByKey.get(key);

      if (!anchor) {
        // No overdue in this person's scope — clear their wave marker.
        if (existing) {
          await admin
            .from("approval_escalation_sends")
            .delete()
            .eq("merchant_id", merchantId)
            .eq("user_id", recipient.userId)
            .eq("escalation_level", level);
          sendByKey.delete(key);
        }
        result.skipped += 1;
        continue;
      }

      // Still in the same wave (oldest overdue anchor still pending) → skip.
      if (existing && pendingIds.has(existing.anchor_approval_id)) {
        result.skipped += 1;
        continue;
      }

      const count = scoped.length;
      const message = pendingApprovalsMessage(count);
      const href = pendingApprovalsHref();
      const absoluteUrl = reviewUrlAbsolute();

      // Claim/upsert the wave marker before network I/O to avoid duplicate sends.
      const { error: claimError } = await admin.from("approval_escalation_sends").upsert(
        {
          merchant_id: merchantId,
          user_id: recipient.userId,
          escalation_level: level,
          anchor_approval_id: anchor.id,
          sent_at: new Date().toISOString(),
        },
        { onConflict: "merchant_id,user_id,escalation_level" },
      );

      if (claimError) {
        result.failed += 1;
        jobLog("error", "claim_failed", {
          merchantId,
          userId: recipient.userId,
          level,
          error: claimError.message,
        });
        continue;
      }
      sendByKey.set(key, {
        user_id: recipient.userId,
        escalation_level: level,
        anchor_approval_id: anchor.id,
      });

      // Re-check anchor still pending after claim.
      const stillPending = pendingIds.has(anchor.id);
      if (!stillPending) {
        result.skipped += 1;
        continue;
      }

      const { error: notifError } = await admin.from("merchant_in_app_notifications").insert({
        merchant_id: merchantId,
        user_id: recipient.userId,
        title: ESCALATION_TITLE,
        message,
        action_label: ESCALATION_ACTION_LABEL,
        action_href: href,
        kind: "approval_escalation",
        escalation_level: level,
      });

      if (notifError) {
        result.failed += 1;
        jobLog("error", "in_app_insert_failed", {
          merchantId,
          userId: recipient.userId,
          level,
          error: notifError.message,
        });
      }

      if (!recipient.email) {
        result.skipped += 1;
        jobLog("warn", "missing_email", {
          merchantId,
          userId: recipient.userId,
          level,
        });
        continue;
      }

      const emailed = await sendPendingApprovalsEscalationEmail({
        to: recipient.email,
        name: recipient.name || undefined,
        businessName: merchant.business_name?.trim() || "your store",
        pendingCount: count,
        reviewUrl: absoluteUrl,
      });

      if (!emailed.ok) {
        result.failed += 1;
        jobLog("error", "email_failed", {
          merchantId,
          userId: recipient.userId,
          level,
          error: emailed.error,
        });
        continue;
      }

      result.notified += 1;
      jobLog("info", "notified", {
        merchantId,
        userId: recipient.userId,
        role: recipient.role,
        level,
        pendingCount: count,
        anchorApprovalId: anchor.id,
      });
    }
  }
}

function buildRecipients(
  members: MemberRow[],
  merchant: MerchantToggles,
): Recipient[] {
  const byUser = new Map<string, Recipient>();

  for (const member of members) {
    if (!member.user_id) continue;
    const email = member.email?.trim() || "";
    byUser.set(member.user_id, {
      userId: member.user_id,
      email,
      name: member.name?.trim() || "",
      role: member.role,
      branchIds: effectiveBranchIds(member.branch_ids, member.branch_id),
      legacyBranchId: member.branch_id,
      productIds: member.product_ids ?? [],
    });
  }

  // Ensure the primary owner is present even if membership email is missing.
  if (merchant.owner_user_id) {
    const existing = byUser.get(merchant.owner_user_id);
    if (existing) {
      if (!existing.email && merchant.email?.trim()) {
        existing.email = merchant.email.trim();
      }
      existing.role = "owner";
    } else if (merchant.email?.trim()) {
      byUser.set(merchant.owner_user_id, {
        userId: merchant.owner_user_id,
        email: merchant.email.trim(),
        name: "",
        role: "owner",
        branchIds: [],
        legacyBranchId: null,
        productIds: [],
      });
    }
  }

  return [...byUser.values()];
}
