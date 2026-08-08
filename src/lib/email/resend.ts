import "server-only";

import { Resend } from "resend";
import { noteResendQuotaHeaders } from "@/lib/admin/resend-quota";
import { getPublicAppOrigin, toPublicEmailUrl } from "@/lib/app-url";
import { persistEmailSend } from "@/lib/email/email-log";

const BRAND = "#004353";
const ACCENT = "#00f47b";
/** Apex froq.io 308s to www — many clients won't load redirected images. */
const EMAIL_ASSET_ORIGIN = "https://www.froq.io";
function logoUrl() {
  return `${EMAIL_ASSET_ORIGIN}/froq-mark.png`;
}
const HELP_URL = `${EMAIL_ASSET_ORIGIN}/help`;
const YEAR = new Date().getFullYear();

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Froq <hello@froq.io>";
}


async function sendTrackedEmail(input: {
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "Email delivery is not configured (missing RESEND_API_KEY)." };
  }
  const { data, error, headers } = await resend.emails.send({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });
  noteResendQuotaHeaders(headers);
  if (error) {
    persistEmailSend({
      kind: input.kind,
      status: "failed",
      to: input.to,
      errorMessage: error.message,
    });
    return { ok: false, error: error.message };
  }
  persistEmailSend({
    kind: input.kind,
    status: "sent",
    to: input.to,
    resendId: data?.id ?? null,
  });
  return { ok: true, id: data?.id };
}


function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Shared Froq branded email shell (logo, card, footer). */
function brandedEmailHtml(input: {
  title: string;
  greeting: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footnoteHtml?: string;
}) {
  // CTA + "having trouble" footer share this URL — never leave localhost in either.
  const actionUrl = escapeHtml(toPublicEmailUrl(input.ctaUrl));
  const greeting = escapeHtml(input.greeting);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${logoUrl()}" width="36" height="36" alt="Froq" style="display:block;border:0;border-radius:10px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">Froq</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 8px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;font-weight:700;color:${BRAND};">${greeting}</p>
              ${input.bodyHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:${ACCENT};">
                    <a href="${actionUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:${BRAND};text-decoration:none;border-radius:8px;">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              ${
                input.footnoteHtml ??
                `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3d5c52;">
                If you have any questions about this request, simply reply to this email or reach out to our
                <a href="${HELP_URL}" style="color:${BRAND};font-weight:700;text-decoration:underline;">support team</a>
                for help.
              </p>`
              }
              <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:${BRAND};">
                Cheers,<br />
                The Froq Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 36px;">
              <hr style="border:none;border-top:1px solid #e6ebe9;margin:0 0 20px;" />
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#7a9088;">
                If you&apos;re having trouble with the button above, copy and paste the URL below into your web browser.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${actionUrl}" style="color:${BRAND};text-decoration:underline;">${actionUrl}</a>
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin-top:20px;">
          <tr>
            <td align="center" style="padding:0 16px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9e97;">
                &copy; ${YEAR} Froq. All rights reserved.
              </p>
              <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#8a9e97;">
                <a href="https://www.froq.io" style="color:#8a9e97;text-decoration:none;">www.froq.io</a>
                &nbsp;·&nbsp;
                <a href="${HELP_URL}" style="color:#8a9e97;text-decoration:none;">Help</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {

  const resetUrl = toPublicEmailUrl(input.resetUrl);
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const html = brandedEmailHtml({
    title: "Reset your Froq password",
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      You recently requested to reset your password for your Froq account.
      Click the button below to reset it.
      <strong style="color:${BRAND};">This password reset is only valid for the next 24 hours.</strong>
    </p>`,
    ctaLabel: "Reset your password",
    ctaUrl: resetUrl,
  });

  return sendTrackedEmail({
    kind: "password_reset",
    to: input.to,
    subject: "Reset your Froq password",
    html,
    text: [
      greeting,
      "",
      "You recently requested to reset your password for your Froq account.",
      "This password reset is only valid for the next 24 hours.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      `Need help? ${HELP_URL}`,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });
}

export async function sendTeamInviteEmail(input: {
  to: string;
  inviteUrl: string;
  businessName: string;
  branchLabel: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const business = escapeHtml(input.businessName);
  const branch = escapeHtml(input.branchLabel);
  const subject = `You're invited to manage ${input.branchLabel} of ${input.businessName}`;
  const inviteUrl = toPublicEmailUrl(input.inviteUrl);

  const html = brandedEmailHtml({
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      You are invited to manage <strong style="color:${BRAND};">${branch}</strong> of
      <strong style="color:${BRAND};">${business}</strong>.
      Click the button below to set up your account.
      <strong style="color:${BRAND};">This link will expire in 7 days.</strong>
    </p>`,
    ctaLabel: "Accept invite",
    ctaUrl: inviteUrl,
  });

  return sendTrackedEmail({
    kind: "team_invite",
    to: input.to,
    subject,
    html,
    text: [
      greeting,
      "",
      `You are invited to manage ${input.branchLabel} of ${input.businessName}.`,
      "This link will expire in 7 days.",
      "",
      `Accept invite: ${inviteUrl}`,
      "",
      `Need help? ${HELP_URL}`,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });
}

export async function sendTeamAccessChangedEmail(input: {
  to: string;
  businessName: string;
  changes: Array<{ label: string; from: string; to: string }>;
  dashboardUrl: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.changes.length === 0) return { ok: true };

  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const business = escapeHtml(input.businessName);
  const subject = `Your access at ${input.businessName} was updated`;
  const dashboardUrl = toPublicEmailUrl(input.dashboardUrl);

  const changeRows = input.changes
    .map(
      (change) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e6ebe9;vertical-align:top;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#7a9088;">
            ${escapeHtml(change.label)}
          </div>
          <div style="margin-top:4px;font-size:15px;line-height:1.5;color:#3d5c52;">
            <span style="text-decoration:line-through;color:#8a9e97;">${escapeHtml(change.from)}</span>
            <span style="margin:0 6px;color:#8a9e97;">→</span>
            <strong style="color:${BRAND};">${escapeHtml(change.to)}</strong>
          </div>
        </td>
      </tr>`,
    )
    .join("");

  const html = brandedEmailHtml({
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Your access for <strong style="color:${BRAND};">${business}</strong> was updated by the account owner.
      Here is what changed:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${changeRows}
    </table>`,
    ctaLabel: "Open dashboard",
    ctaUrl: dashboardUrl,
  });

  const textChanges = input.changes
    .map((change) => `- ${change.label}: ${change.from} → ${change.to}`)
    .join("\n");

  return sendTrackedEmail({
    kind: "team_access_changed",
    to: input.to,
    subject,
    html,
    text: [
      greeting,
      "",
      `Your access for ${input.businessName} was updated by the account owner.`,
      "Here is what changed:",
      textChanges,
      "",
      `Open dashboard: ${dashboardUrl}`,
      "",
      `Need help? ${HELP_URL}`,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });
}

function supportInbox() {
  return process.env.SUPPORT_INBOX_EMAIL?.trim() || "hello@froq.io";
}

/**
 * Two messages for one ticket: the full detail to our inbox (with reply-to set
 * to the sender so a reply goes straight back to them), and a short receipt to
 * the sender carrying the reference.
 *
 * The inbox copy is the one that matters — if the receipt fails we still report
 * success, because the ticket is already recorded.
 */
export async function sendSupportTicketEmails(input: {
  reference: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  businessName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!getResend()) {
    return { ok: false, error: "Email delivery is not configured (missing RESEND_API_KEY)." };
  }

  const rows: Array<[string, string]> = [
    ["Reference", input.reference],
    ["From", `${input.name} <${input.email}>`],
    ["Category", input.category],
    ["Business", input.businessName?.trim() || "—"],
  ];

  const inbox = await sendTrackedEmail({
    kind: "support_inbox",
    to: supportInbox(),
    replyTo: input.email,
    subject: `[${input.reference}] ${input.subject}`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND};">
      <h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(input.subject)}</h2>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:2px 16px 2px 0;color:#7a9088;">${escapeHtml(label)}</td><td style="padding:2px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`,
          )
          .join("")}
      </table>
      <div style="padding:16px;background:#f4f5f6;border-radius:8px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(input.message)}</div>
    </div>`,
    text: [
      input.subject,
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      input.message,
    ].join("\n"),
  });

  if (!inbox.ok) {
    return { ok: false, error: inbox.error };
  }

  const greeting = input.name.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  await sendTrackedEmail({
    kind: "support_receipt",
    to: input.email,
    replyTo: supportInbox(),
    subject: `We've got your request (${input.reference})`,
    html: brandedEmailHtml({
      title: "We've got your request",
      greeting,
      bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d5c52;">
        Thanks for getting in touch. Your reference is
        <strong style="color:${BRAND};">${escapeHtml(input.reference)}</strong> — quote it if you
        reply and we'll pick up the thread.
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
        We usually reply within one business day. Here's what you sent us:
      </p>
      <div style="margin:0 0 24px;padding:16px;background:#f4f5f6;border-radius:8px;font-size:15px;line-height:1.6;color:#3d5c52;">
        <strong style="color:${BRAND};">${escapeHtml(input.subject)}</strong><br />
        <span style="white-space:pre-wrap;">${escapeHtml(input.message)}</span>
      </div>`,
      ctaLabel: "Browse help articles",
      ctaUrl: HELP_URL,
      footnoteHtml: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3d5c52;">
        You can simply reply to this email to add anything you forgot.
      </p>`,
    }),
    text: [
      greeting,
      "",
      `Thanks for getting in touch. Your reference is ${input.reference}.`,
      "We usually reply within one business day.",
      "",
      `Subject: ${input.subject}`,
      input.message,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });

  return { ok: true };
}

export async function sendEmailVerificationCode(input: {
  to: string;
  code: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {

  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const code = escapeHtml(input.code);
  const html = brandedEmailHtml({
    title: "Verify your email — Froq",
    greeting,
    bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Use this code to verify your email for your Froq merchant account.
      <strong style="color:${BRAND};">It expires in 5 minutes.</strong>
    </p>
    <p style="margin:0 0 24px;font-size:32px;font-weight:800;letter-spacing:0.18em;color:${BRAND};">${code}</p>`,
    ctaLabel: "Open Froq",
    ctaUrl: getPublicAppOrigin(),
    footnoteHtml: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3d5c52;">
      If you didn&apos;t request this code, you can safely ignore this email.
    </p>`,
  });

  return sendTrackedEmail({
    kind: "email_verification",
    to: input.to,
    subject: "Your Froq verification code",
    html,
    text: [
      greeting,
      "",
      `Your Froq verification code is ${input.code}.`,
      "It expires in 5 minutes.",
      "",
      "If you didn't request this code, you can ignore this email.",
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });
}

export async function sendPendingApprovalsEscalationEmail(input: {
  to: string;
  name?: string;
  businessName: string;
  pendingCount: number;
  reviewUrl: string;
}): Promise<{ ok: boolean; error?: string }> {

  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const business = escapeHtml(input.businessName);
  const count = Math.max(0, Math.floor(input.pendingCount));
  const message =
    count === 1
      ? "1 customer is waiting for stamp approval."
      : `${count} customers are waiting for stamp approval.`;
  const reviewUrl = toPublicEmailUrl(input.reviewUrl);

  const html = brandedEmailHtml({
    title: "Pending Stamp Approvals",
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      <strong style="color:${BRAND};">${escapeHtml(message)}</strong>
      Review pending stamp requests for <strong style="color:${BRAND};">${business}</strong> so customers aren't kept waiting.
    </p>`,
    ctaLabel: "Review Pending Approvals",
    ctaUrl: reviewUrl,
  });

  return sendTrackedEmail({
    kind: "pending_approvals",
    to: input.to,
    subject: `Pending Stamp Approvals — ${input.businessName}`,
    html,
    text: [
      greeting,
      "",
      message,
      `Review pending stamp requests for ${input.businessName}.`,
      "",
      `Review Pending Approvals: ${reviewUrl}`,
      "",
      `Need help? ${HELP_URL}`,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });
}

async function sendBrandedMerchantEmail(input: {
  to: string;
  subject: string;
  title: string;
  greeting: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  textLines: string[];
  kind?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctaUrl = toPublicEmailUrl(input.ctaUrl);
  const html = brandedEmailHtml({
    title: input.title,
    greeting: input.greeting,
    bodyHtml: input.bodyHtml,
    ctaLabel: input.ctaLabel,
    ctaUrl,
  });

  return sendTrackedEmail({
    kind: input.kind ?? "merchant_notice",
    to: input.to,
    subject: input.subject,
    html,
    text: [
      input.greeting,
      "",
      ...input.textLines,
      "",
      `${input.ctaLabel}: ${ctaUrl}`,
      "",
      `Need help? ${HELP_URL}`,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });
}

function greetingFor(name?: string | null) {
  return name?.trim() ? `Hi ${name.trim()},` : "Hi there,";
}

export async function sendTrialEndingEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  daysLeft: 1 | 2;
  trialEndsOn: string;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const days = input.daysLeft === 1 ? "1 day" : `${input.daysLeft} days`;
  const subject = `Your ${input.productLabel} trial ends in ${days}`;
  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    kind: "trial_ending",
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Your free trial of <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>
      for <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>
      ends on <strong style="color:${BRAND};">${escapeHtml(input.trialEndsOn)}</strong>
      (${escapeHtml(days)} left).
      Choose a plan to keep serving guests without interruption.
    </p>`,
    ctaLabel: "Choose a plan",
    ctaUrl: input.manageUrl,
    textLines: [
      `Your free trial of ${input.productLabel} for ${input.businessName} ends on ${input.trialEndsOn} (${days} left).`,
      "Choose a plan to keep serving guests without interruption.",
    ],
  });
}

export async function sendPlanUpgradedEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  fromPlan: string;
  toPlan: string;
  effectiveOn: string;
  priceLabel?: string | null;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const subject = `${input.productLabel} upgraded to ${input.toPlan}`;
  const priceLine = input.priceLabel
    ? ` New price: <strong style="color:${BRAND};">${escapeHtml(input.priceLabel)}</strong>.`
    : "";
  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>'s
      <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>
      plan was upgraded from ${escapeHtml(input.fromPlan)} to
      <strong style="color:${BRAND};">${escapeHtml(input.toPlan)}</strong>
      on ${escapeHtml(input.effectiveOn)}.${priceLine}
    </p>`,
    ctaLabel: "View plan",
    ctaUrl: input.manageUrl,
    textLines: [
      `${input.businessName}'s ${input.productLabel} plan was upgraded from ${input.fromPlan} to ${input.toPlan} on ${input.effectiveOn}.`,
      ...(input.priceLabel ? [`New price: ${input.priceLabel}.`] : []),
    ],
  });
}

export async function sendPlanDowngradeScheduledEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  fromPlan: string;
  toPlan: string;
  effectiveOn: string;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const subject = `${input.productLabel} downgrade scheduled`;
  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Your <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>
      plan for <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>
      will change from ${escapeHtml(input.fromPlan)} to
      <strong style="color:${BRAND};">${escapeHtml(input.toPlan)}</strong>
      on <strong style="color:${BRAND};">${escapeHtml(input.effectiveOn)}</strong>.
      You keep your current plan until that date.
    </p>`,
    ctaLabel: "Manage plan",
    ctaUrl: input.manageUrl,
    textLines: [
      `Your ${input.productLabel} plan for ${input.businessName} will change from ${input.fromPlan} to ${input.toPlan} on ${input.effectiveOn}.`,
      "You keep your current plan until that date.",
    ],
  });
}

export async function sendPlanDowngradedEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  fromPlan: string;
  toPlan: string;
  effectiveOn: string;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const subject = `${input.productLabel} downgraded to ${input.toPlan}`;
  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Your <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>
      plan for <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>
      changed from ${escapeHtml(input.fromPlan)} to
      <strong style="color:${BRAND};">${escapeHtml(input.toPlan)}</strong>
      on ${escapeHtml(input.effectiveOn)}.
    </p>`,
    ctaLabel: "View plan",
    ctaUrl: input.manageUrl,
    textLines: [
      `Your ${input.productLabel} plan for ${input.businessName} changed from ${input.fromPlan} to ${input.toPlan} on ${input.effectiveOn}.`,
    ],
  });
}

export async function sendPlanCancelScheduledEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  planName: string;
  effectiveOn: string;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const subject = `${input.productLabel} cancellation scheduled`;
  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Your <strong style="color:${BRAND};">${escapeHtml(input.planName)}</strong>
      <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>
      plan for <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>
      will end on <strong style="color:${BRAND};">${escapeHtml(input.effectiveOn)}</strong>.
      You'll keep access until then. After that date the product locks until you subscribe again.
    </p>`,
    ctaLabel: "Manage plan",
    ctaUrl: input.manageUrl,
    textLines: [
      `Your ${input.planName} ${input.productLabel} plan for ${input.businessName} will end on ${input.effectiveOn}.`,
      "You'll keep access until then. After that date the product locks until you subscribe again.",
    ],
  });
}

export async function sendPlanCanceledEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  planName: string;
  effectiveOn: string;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const subject = `${input.productLabel} subscription cancelled`;
  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      Your <strong style="color:${BRAND};">${escapeHtml(input.planName)}</strong>
      <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>
      plan for <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>
      ended on ${escapeHtml(input.effectiveOn)}. The product is locked until you subscribe again.
    </p>`,
    ctaLabel: "Resubscribe",
    ctaUrl: input.manageUrl,
    textLines: [
      `Your ${input.planName} ${input.productLabel} plan for ${input.businessName} ended on ${input.effectiveOn}.`,
      "The product is locked until you subscribe again.",
    ],
  });
}

export async function sendUsageThresholdEmail(input: {
  to: string;
  name?: string | null;
  businessName: string;
  productLabel: string;
  metricLabel: string;
  used: number;
  limit: number;
  percent: 50 | 70 | 100;
  manageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = greetingFor(input.name);
  const usedLabel = input.used.toLocaleString("en-IN");
  const limitLabel = input.limit.toLocaleString("en-IN");
  const subject =
    input.percent >= 100
      ? `${input.productLabel}: ${input.metricLabel} limit reached`
      : `${input.productLabel}: ${input.percent}% of ${input.metricLabel} used`;
  const headline =
    input.percent >= 100
      ? `You've used all ${limitLabel} ${escapeHtml(input.metricLabel)} on your plan.`
      : `You've used <strong style="color:${BRAND};">${usedLabel} of ${limitLabel}</strong> ${escapeHtml(input.metricLabel)} (${input.percent}% of your plan).`;
  const nextStep =
    input.percent >= 100
      ? "Consider upgrading to keep adding more without interruption."
      : "Consider upgrading before you hit the limit.";

  return sendBrandedMerchantEmail({
    to: input.to,
    subject,
    title: subject,
    greeting,
    bodyHtml: `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
      For <strong style="color:${BRAND};">${escapeHtml(input.businessName)}</strong>'s
      <strong style="color:${BRAND};">${escapeHtml(input.productLabel)}</strong>:
      ${headline}
      ${escapeHtml(nextStep)}
    </p>`,
    ctaLabel: "Upgrade plan",
    ctaUrl: input.manageUrl,
    textLines: [
      `For ${input.businessName}'s ${input.productLabel}:`,
      input.percent >= 100
        ? `You've used all ${limitLabel} ${input.metricLabel} on your plan.`
        : `You've used ${usedLabel} of ${limitLabel} ${input.metricLabel} (${input.percent}% of your plan).`,
      nextStep,
    ],
  });
}
