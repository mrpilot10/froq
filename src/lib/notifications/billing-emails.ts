import "server-only";

import { getPublicAppOrigin } from "@/lib/app-url";
import {
  sendPlanCancelScheduledEmail,
  sendPlanCanceledEmail,
  sendPlanDowngradeScheduledEmail,
  sendPlanDowngradedEmail,
  sendPlanUpgradedEmail,
  sendTrialEndingEmail,
  sendUsageThresholdEmail,
} from "@/lib/email/resend";
import { formatBillingDate } from "@/lib/merchant/billing";
import { resolveMerchantOwnerContact } from "@/lib/merchant/owner-contact";
import { getPlanById, ALL_PLANS } from "@/lib/merchant/pricing";
import type { MerchantProduct } from "@/lib/merchant/types";
import { createAdminClient } from "@/lib/supabase/admin";

const PRODUCT_LABEL: Record<MerchantProduct, string> = {
  loyalty: "Loyalty Stamps",
  queue: "Queue Management",
  reservation: "Reservations",
  menu: "AI Menu",
};

const PLAN_PATH: Record<MerchantProduct, string> = {
  loyalty: "/merchant/loyalty/plan",
  queue: "/merchant/queue/plan",
  reservation: "/merchant/reservations/plan",
  menu: "/merchant/menu/plan",
};

export function productLabel(product: MerchantProduct): string {
  return PRODUCT_LABEL[product];
}

export function productManageUrl(product: MerchantProduct): string {
  return `${getPublicAppOrigin()}${PLAN_PATH[product]}`;
}

export function planDisplayName(planId: string | null | undefined): string {
  if (!planId) return "Free trial";
  const plan = getPlanById(planId);
  return plan.id === planId || ALL_PLANS.some((p) => p.id === planId)
    ? plan.name
    : planId;
}

function planPriceLabel(planId: string | null | undefined): string | null {
  if (!planId) return null;
  try {
    const plan = getPlanById(planId);
    return `${plan.priceLabel}${plan.billing === "yearly" ? "/yr" : "/mo"}`;
  } catch {
    return null;
  }
}

/**
 * Claims a one-shot notice slot. Returns true when this process should send.
 * Duplicate claims (same merchant/product/type/period) are skipped.
 */
export async function claimBillingNotice(input: {
  merchantId: string;
  product: MerchantProduct;
  noticeType: string;
  periodKey: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_notice_log")
    .insert({
      merchant_id: input.merchantId,
      product: input.product,
      notice_type: input.noticeType,
      period_key: input.periodKey,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // Unique violation → already sent.
    if (error.code === "23505") return false;
    console.error("[billing-email] claim failed", error.message);
    return false;
  }
  return Boolean(data?.id);
}

function logEmailFailure(kind: string, error: unknown) {
  console.error(
    JSON.stringify({
      scope: "billing_email",
      event: "send_failed",
      kind,
      error: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    }),
  );
}

/** Fire-and-forget safe wrappers — never throw into billing mutations. */
export async function notifyPlanUpgraded(input: {
  merchantId: string;
  product: MerchantProduct;
  fromPlanId: string | null;
  toPlanId: string;
  effectiveOn?: string | null;
}): Promise<void> {
  try {
    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const when = formatBillingDate(input.effectiveOn ?? new Date().toISOString());
    const result = await sendPlanUpgradedEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      fromPlan: planDisplayName(input.fromPlanId),
      toPlan: planDisplayName(input.toPlanId),
      effectiveOn: when,
      priceLabel: planPriceLabel(input.toPlanId),
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("upgraded", result.error);
  } catch (error) {
    logEmailFailure("upgraded", error);
  }
}

export async function notifyPlanDowngradeScheduled(input: {
  merchantId: string;
  product: MerchantProduct;
  fromPlanId: string | null;
  toPlanId: string;
  effectiveOn: string;
}): Promise<void> {
  try {
    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const result = await sendPlanDowngradeScheduledEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      fromPlan: planDisplayName(input.fromPlanId),
      toPlan: planDisplayName(input.toPlanId),
      effectiveOn: formatBillingDate(input.effectiveOn),
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("downgrade_scheduled", result.error);
  } catch (error) {
    logEmailFailure("downgrade_scheduled", error);
  }
}

export async function notifyPlanDowngraded(input: {
  merchantId: string;
  product: MerchantProduct;
  fromPlanId: string | null;
  toPlanId: string;
  effectiveOn?: string | null;
}): Promise<void> {
  try {
    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const result = await sendPlanDowngradedEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      fromPlan: planDisplayName(input.fromPlanId),
      toPlan: planDisplayName(input.toPlanId),
      effectiveOn: formatBillingDate(input.effectiveOn ?? new Date().toISOString()),
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("downgraded", result.error);
  } catch (error) {
    logEmailFailure("downgraded", error);
  }
}

export async function notifyPlanCancelScheduled(input: {
  merchantId: string;
  product: MerchantProduct;
  planId: string;
  effectiveOn: string;
}): Promise<void> {
  try {
    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const result = await sendPlanCancelScheduledEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      planName: planDisplayName(input.planId),
      effectiveOn: formatBillingDate(input.effectiveOn),
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("cancel_scheduled", result.error);
  } catch (error) {
    logEmailFailure("cancel_scheduled", error);
  }
}

export async function notifyPlanCanceled(input: {
  merchantId: string;
  product: MerchantProduct;
  planId: string | null;
  effectiveOn?: string | null;
}): Promise<void> {
  try {
    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const result = await sendPlanCanceledEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      planName: planDisplayName(input.planId),
      effectiveOn: formatBillingDate(input.effectiveOn ?? new Date().toISOString()),
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("canceled", result.error);
  } catch (error) {
    logEmailFailure("canceled", error);
  }
}

export async function notifyTrialEnding(input: {
  merchantId: string;
  product: MerchantProduct;
  daysLeft: 1 | 2;
  trialEndsAt: string;
}): Promise<void> {
  try {
    const claimed = await claimBillingNotice({
      merchantId: input.merchantId,
      product: input.product,
      noticeType: `trial_ending_${input.daysLeft}d`,
      periodKey: input.trialEndsAt.slice(0, 10),
    });
    if (!claimed) return;

    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const result = await sendTrialEndingEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      daysLeft: input.daysLeft,
      trialEndsOn: formatBillingDate(input.trialEndsAt),
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("trial_ending", result.error);
  } catch (error) {
    logEmailFailure("trial_ending", error);
  }
}

export async function notifyUsageThreshold(input: {
  merchantId: string;
  product: MerchantProduct;
  metricKey: string;
  metricLabel: string;
  used: number;
  limit: number;
  percent: 50 | 70 | 100;
  periodKey: string;
}): Promise<void> {
  try {
    const claimed = await claimBillingNotice({
      merchantId: input.merchantId,
      product: input.product,
      noticeType: `usage_${input.metricKey}_${input.percent}`,
      periodKey: input.periodKey,
    });
    if (!claimed) return;

    const owner = await resolveMerchantOwnerContact(input.merchantId);
    if (!owner) return;
    const result = await sendUsageThresholdEmail({
      to: owner.email,
      name: owner.name,
      businessName: owner.businessName,
      productLabel: productLabel(input.product),
      metricLabel: input.metricLabel,
      used: input.used,
      limit: input.limit,
      percent: input.percent,
      manageUrl: productManageUrl(input.product),
    });
    if (!result.ok) logEmailFailure("usage", result.error);
  } catch (error) {
    logEmailFailure("usage", error);
  }
}
