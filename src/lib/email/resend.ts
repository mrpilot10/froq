import "server-only";

import { Resend } from "resend";

const BRAND = "#004353";
const ACCENT = "#00f47b";
const LOGO_URL = "https://www.froq.io/froq-logo.png";
const HELP_URL = "https://www.froq.io/help";
const YEAR = new Date().getFullYear();

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Froq <hello@froq.io>";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function passwordResetHtml(input: { name?: string; resetUrl: string }) {
  const greeting = input.name?.trim() ? `Hi ${escapeHtml(input.name.trim())},` : "Hi there,";
  const actionUrl = escapeHtml(input.resetUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset your Froq password</title>
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
                    <img src="${LOGO_URL}" width="32" height="32" alt="Froq" style="display:block;border:0;border-radius:8px;" />
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
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c52;">
                You recently requested to reset your password for your Froq account.
                Click the button below to reset it.
                <strong style="color:${BRAND};">This password reset is only valid for the next 24 hours.</strong>
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:${ACCENT};">
                    <a href="${actionUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:${BRAND};text-decoration:none;border-radius:8px;">
                      Reset your password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3d5c52;">
                If you have any questions about this request, simply reply to this email or reach out to our
                <a href="${HELP_URL}" style="color:${BRAND};font-weight:700;text-decoration:underline;">support team</a>
                for help.
              </p>
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
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "Email delivery is not configured (missing RESEND_API_KEY)." };
  }

  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: input.to,
    subject: "Reset your Froq password",
    html: passwordResetHtml({ name: input.name, resetUrl: input.resetUrl }),
    text: [
      input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,",
      "",
      "You recently requested to reset your password for your Froq account.",
      "This password reset is only valid for the next 24 hours.",
      "",
      `Reset your password: ${input.resetUrl}`,
      "",
      `Need help? ${HELP_URL}`,
      "",
      "Cheers,",
      "The Froq Team",
    ].join("\n"),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
