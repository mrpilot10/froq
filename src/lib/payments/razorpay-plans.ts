/**
 * Maps Froq catalog plan ids → Razorpay Plan ids (Dashboard → Subscriptions → Plans).
 * Override via env without a redeploy for a single id, e.g.
 *   RAZORPAY_PLAN_STARTER=plan_xxx
 *
 * Note: Razorpay plan ids are case-sensitive (e.g. DryOfr ≠ Dry0fr).
 */

const RAZORPAY_PLANS: Record<string, string> = {
  // ── Loyalty Stamps ──────────────────────────────────────────────────────
  starter: process.env.RAZORPAY_PLAN_STARTER?.trim() || "plan_TKDr4oryzlvt5l",
  growth: process.env.RAZORPAY_PLAN_GROWTH?.trim() || "plan_TMXJVqq8BudKVo",
  pro: process.env.RAZORPAY_PLAN_PRO?.trim() || "plan_TMXK3PkY95xwbG",
  "starter-yearly":
    process.env.RAZORPAY_PLAN_STARTER_YEARLY?.trim() || "plan_TMl6jeMkjTmp4E",
  "growth-yearly":
    process.env.RAZORPAY_PLAN_GROWTH_YEARLY?.trim() || "plan_TMl6MqLwFy5jLY",
  "pro-yearly":
    process.env.RAZORPAY_PLAN_PRO_YEARLY?.trim() || "plan_TMl5zQGoDryOfr",

  // ── AI Menu ─────────────────────────────────────────────────────────────
  "menu-starter":
    process.env.RAZORPAY_PLAN_MENU_STARTER?.trim() || "plan_TMXMemkevJuOKM",
  "menu-growth":
    process.env.RAZORPAY_PLAN_MENU_GROWTH?.trim() || "plan_TMXMymKyywhR7w",
  "menu-pro":
    process.env.RAZORPAY_PLAN_MENU_PRO?.trim() || "plan_TMXNDSM6M2W8tW",
  "menu-starter-yearly":
    process.env.RAZORPAY_PLAN_MENU_STARTER_YEARLY?.trim() || "plan_TMlcCoMKIuzp7L",
  "menu-growth-yearly":
    process.env.RAZORPAY_PLAN_MENU_GROWTH_YEARLY?.trim() || "plan_TMlcfkFQLtdYZA",
  "menu-pro-yearly":
    process.env.RAZORPAY_PLAN_MENU_PRO_YEARLY?.trim() || "plan_TMld6XygqprQ8Y",

  // ── Queue Management ────────────────────────────────────────────────────
  "queue-starter":
    process.env.RAZORPAY_PLAN_QUEUE_STARTER?.trim() || "plan_TMmNhEaad7P9Tp",
  "queue-growth":
    process.env.RAZORPAY_PLAN_QUEUE_GROWTH?.trim() || "plan_TMmNxw7Ue4nf2R",
  "queue-pro":
    process.env.RAZORPAY_PLAN_QUEUE_PRO?.trim() || "plan_TMmOGitsic74b7",
  "queue-starter-yearly":
    process.env.RAZORPAY_PLAN_QUEUE_STARTER_YEARLY?.trim() || "plan_TMmOepNPGmC1Rl",
  "queue-growth-yearly":
    process.env.RAZORPAY_PLAN_QUEUE_GROWTH_YEARLY?.trim() || "plan_TMmP5TfjzznakZ",
  "queue-pro-yearly":
    process.env.RAZORPAY_PLAN_QUEUE_PRO_YEARLY?.trim() || "plan_TMmPrQyDCnSnde",
};

/** Billing cycles before Razorpay auto-stops (cancel earlier from Dashboard / API). */
const YEARLY_TOTAL_COUNT = 10;
const MONTHLY_TOTAL_COUNT = 120;

export function razorpayPlanIdFor(froqPlanId: string): string | null {
  return RAZORPAY_PLANS[froqPlanId] ?? null;
}

export function isRazorpaySubscriptionPlan(froqPlanId: string): boolean {
  return razorpayPlanIdFor(froqPlanId) != null;
}

export function subscriptionTotalCount(froqPlanId: string): number {
  return froqPlanId.endsWith("-yearly") ? YEARLY_TOTAL_COUNT : MONTHLY_TOTAL_COUNT;
}
