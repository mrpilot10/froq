/**
 * HTML + plain-text email bodies for every customer notification template.
 * Fun, energetic copy — emojis + bold highlighted variables.
 */

import { loyaltyCardUrl } from "@/lib/whatsapp/templates/names";
import { requireCustomerPublicToken } from "@/lib/customer/hub";
import { reservationUrl } from "@/lib/reservations/link";
import { formatBookingSize, formatEstimatedWaitTime } from "@/lib/queue/format";
import {
  customerMenuUrl,
  getPublicAppOrigin,
  merchantMenuUrl,
  toPublicEmailUrl,
} from "@/lib/app-url";
import type {
  BirthdayBonusStampsData,
  CustomerNotificationDataMap,
  CustomerNotificationTemplate,
  NotifiableCustomer,
  QueueJoinedData,
  QueuePartyData,
  ReservationDeclinedData,
  RewardReadyWaitTimeData,
  RewardRedeemedData,
  RewardUnlockedData,
  StampCollectedLastWaitTimeData,
  StampVerifiedData,
  WaitlistCalledData,
} from "@/lib/notifications/types";

const BRAND = "#004353";
const ACCENT = "#00f47b";
const EMAIL_ASSET_ORIGIN = "https://www.froq.io";
const HELP_URL = `${EMAIL_ASSET_ORIGIN}/help`;
const YEAR = new Date().getFullYear();

function logoUrl() {
  return `${EMAIL_ASSET_ORIGIN}/froq-mark.png`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Highlight a dynamic value in HTML (escaped + bold brand color). */
function strong(value: string | number) {
  return `<strong style="color:${BRAND};font-weight:800;">${escapeHtml(String(value))}</strong>`;
}

function p(html: string) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3d5c52;">${html}</p>`;
}

function highlightBox(html: string) {
  return `<div style="margin:0 0 20px;padding:14px 16px;border-radius:10px;background:#e8fff4;border:1px solid #b8f0d4;font-size:15px;line-height:1.55;color:${BRAND};font-weight:700;">${html}</div>`;
}

function brandedEmailHtml(input: {
  title: string;
  /** Already-safe HTML greeting (emoji allowed). */
  greetingHtml: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const actionUrl = input.ctaUrl
    ? escapeHtml(toPublicEmailUrl(input.ctaUrl))
    : "";
  const ctaBlock =
    input.ctaLabel && actionUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:${ACCENT};">
                    <a href="${actionUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:${BRAND};text-decoration:none;border-radius:8px;">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>`
      : "";
  const trouble =
    actionUrl
      ? `<tr>
            <td style="padding:28px 40px 36px;">
              <hr style="border:none;border-top:1px solid #e6ebe9;margin:0 0 20px;" />
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#7a9088;">
                Button not working? Paste this into your browser:
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${actionUrl}" style="color:${BRAND};text-decoration:underline;">${actionUrl}</a>
              </p>
            </td>
          </tr>`
      : "";

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
            <td style="padding:36px 40px 20px;">
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
              <p style="margin:0 0 18px;font-size:18px;line-height:1.45;font-weight:800;color:${BRAND};">${input.greetingHtml}</p>
              ${input.bodyHtml}
              ${ctaBlock}
              <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:${BRAND};">
                Catch you soon 👋<br />
                <strong>The Froq Team</strong>
              </p>
            </td>
          </tr>
          ${trouble}
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

function hubUrl(customer: NotifiableCustomer): string {
  try {
    return loyaltyCardUrl(requireCustomerPublicToken(customer.publicToken));
  } catch {
    return getPublicAppOrigin();
  }
}

function plainBody(lines: string[]) {
  return [
    ...lines,
    "",
    `Need help? ${HELP_URL}`,
    "",
    "Catch you soon,",
    "The Froq Team",
  ].join("\n");
}

function hi(name: string) {
  return {
    html: `Hey ${strong(name)}! 👋`,
    text: `Hey ${name}! 👋`,
  };
}

export type CustomerNotificationEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Build email content for a customer notification template.
 * Adding a template case here is required for new events (compile-time exhaustiveness).
 */
export function buildCustomerNotificationEmail<
  T extends CustomerNotificationTemplate,
>(
  template: T,
  customer: NotifiableCustomer,
  data: CustomerNotificationDataMap[T],
): CustomerNotificationEmail {
  const name = customer.name.trim() || "there";
  const greet = hi(name);
  const hub = hubUrl(customer);
  const menuLink = toPublicEmailUrl(customerMenuUrl(customer.publicToken));

  switch (template) {
    case "stamp_verified": {
      const d = data as StampVerifiedData;
      const progress = `${d.currentStamps}/${d.requiredStamps}`;
      const subject = `✨ Stamp in! You're ${progress} at ${d.businessName}`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(
              `Boom — another stamp just landed at ${strong(d.businessName)}. 🐸`,
            ) +
            highlightBox(
              `📊 Progress: ${strong(progress)} toward ${strong(d.rewardTitle)}`,
            ) +
            p(`Keep going — that ${strong(d.rewardTitle)} is getting closer.`),
          ctaLabel: "👀 Open my loyalty card",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `Boom — another stamp just landed at ${d.businessName}. 🐸`,
          `Progress: ${progress} toward ${d.rewardTitle}`,
          "",
          `Open card: ${hub}`,
        ]),
      };
    }
    case "reward_unlocked": {
      const d = data as RewardUnlockedData;
      const progress = `${d.currentStamps}/${d.requiredStamps}`;
      const subject = `🎉 You unlocked ${d.rewardTitle}!`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`You did it! All stamps collected at ${strong(d.businessName)}.`) +
            highlightBox(
              `🎁 Reward unlocked: ${strong(d.rewardTitle)} · ${strong(progress)}`,
            ) +
            p(`Show your QR at the counter and claim it — you earned this.`),
          ctaLabel: "🎁 Redeem my reward",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `You did it! All stamps collected at ${d.businessName}.`,
          `Reward unlocked: ${d.rewardTitle} (${progress})`,
          "",
          `Redeem: ${hub}`,
        ]),
      };
    }
    case "stamp_collected_last_wait_time": {
      const d = data as StampCollectedLastWaitTimeData;
      const progress = `${d.currentStamps}/${d.requiredStamps}`;
      const subject = `🔓 ${d.rewardTitle} unlocked — open in ${d.waitLabel}`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(
              `Full card! You hit ${strong(progress)} at ${strong(d.businessName)}. 🔥`,
            ) +
            highlightBox(
              `🎁 ${strong(d.rewardTitle)} unlocks in ${strong(d.waitLabel)}`,
            ) +
            p(`We'll nudge you when the QR is ready. Hang tight — worth the wait.`),
          ctaLabel: "👀 View my card",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `Full card! ${progress} at ${d.businessName}.`,
          `${d.rewardTitle} unlocks in ${d.waitLabel}.`,
          "",
          `Card: ${hub}`,
        ]),
      };
    }
    case "reward_ready_wait_time": {
      const d = data as RewardReadyWaitTimeData;
      const subject = `🚀 ${d.rewardTitle} is READY to claim`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`The wait is over at ${strong(d.businessName)}.`) +
            highlightBox(`🎁 ${strong(d.rewardTitle)} is live — grab it now!`) +
            p(`Open your card, flash the QR, and enjoy.`),
          ctaLabel: "🎁 Claim reward now",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `The wait is over at ${d.businessName}.`,
          `${d.rewardTitle} is ready — claim it now!`,
          "",
          `Redeem: ${hub}`,
        ]),
      };
    }
    case "reward_redeemed": {
      const d = data as RewardRedeemedData;
      const subject = `🥂 ${d.rewardTitle} claimed — nice one!`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`Success! Your ${strong(d.rewardTitle)} is officially claimed.`) +
            highlightBox(`📍 ${strong(d.businessName)}`) +
            p(`Ready for the next round of stamps? Your card is waiting.`),
          ctaLabel: hub ? "👀 Back to my card" : undefined,
          ctaUrl: hub || undefined,
        }),
        text: plainBody([
          greet.text,
          "",
          `Success! ${d.rewardTitle} claimed at ${d.businessName}.`,
          ...(hub ? ["", `Card: ${hub}`] : []),
        ]),
      };
    }
    case "waitlist_called": {
      const d = data as WaitlistCalledData;
      const pos =
        d.position != null ? ` (you were #${escapeHtml(String(d.position))})` : "";
      const posText = d.position != null ? ` (you were #${d.position})` : "";
      const subject = `📣 You're UP at ${d.businessName}!`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`This is your moment — head to the counter now.`) +
            highlightBox(
              `⚡ ${strong(d.businessName)} is ready for you${pos}`,
            ) +
            p(`Don't leave them waiting — go shine.`),
          ctaLabel: "📍 See my spot",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `${d.businessName} is ready for you${posText}!`,
          "",
          `Details: ${hub}`,
        ]),
      };
    }
    case "reservation_request_received":
    case "reservation_confirmed":
    case "reservation_confirmed_menu":
    case "reservation_updated":
    case "reservation_reminder":
    case "reservation_declined": {
      const d = data as ReservationDeclinedData;
      const rUrl = reservationUrl(d.reservationToken);
      const partyLabel =
        d.partySize != null ? ` · party of ${d.partySize}` : "";

      if (template === "reservation_request_received") {
        const subject = `📩 Request sent to ${d.businessName}`;
        return {
          subject,
          html: brandedEmailHtml({
            title: subject,
            greetingHtml: greet.html,
            bodyHtml:
              p(`We're on it — your table request is in.`) +
              highlightBox(
                `🍽️ ${strong(d.businessName)} · ${strong(d.when)}${
                  d.partySize != null
                    ? ` · ${strong(`party of ${d.partySize}`)}`
                    : ""
                }`,
              ) +
              p(`Hang tight while they confirm. Track everything on your reservation page.`),
            ctaLabel: "👀 Track reservation",
            ctaUrl: rUrl,
          }),
          text: plainBody([
            greet.text,
            "",
            `Request received at ${d.businessName} for ${d.when}${partyLabel}.`,
            "",
            `View: ${rUrl}`,
          ]),
        };
      }
      if (template === "reservation_confirmed") {
        const subject = `✅ Table locked at ${d.businessName}`;
        return {
          subject,
          html: brandedEmailHtml({
            title: subject,
            greetingHtml: greet.html,
            bodyHtml:
              p(`You're booked — time to look forward to it. ✨`) +
              highlightBox(
                `🗓️ ${strong(d.when)}${partyLabel ? ` · ${strong(`party of ${d.partySize}`)}` : ""}` +
                  `<br/>📍 ${strong(d.businessName)}`,
              ) +
              p(`Need to tweak anything? Manage it from your reservation page.`),
            ctaLabel: "🍽️ View reservation",
            ctaUrl: rUrl,
          }),
          text: plainBody([
            greet.text,
            "",
            `Confirmed at ${d.businessName} for ${d.when}${partyLabel}.`,
            "",
            `View: ${rUrl}`,
          ]),
        };
      }
      if (template === "reservation_confirmed_menu") {
        const subject = `✅ Table locked at ${d.businessName}`;
        const menuCta = toPublicEmailUrl(
          d.menuSlug?.trim()
            ? merchantMenuUrl(d.menuSlug.trim(), customer.publicToken)
            : customerMenuUrl(customer.publicToken),
        );
        return {
          subject,
          html: brandedEmailHtml({
            title: subject,
            greetingHtml: greet.html,
            bodyHtml:
              p(`You're booked — browse the menu while you wait. ✨`) +
              highlightBox(
                `🗓️ ${strong(d.when)}${partyLabel ? ` · ${strong(`party of ${d.partySize}`)}` : ""}` +
                  `<br/>📍 ${strong(d.businessName)}`,
              ) +
              p(
                `Reservation page: <a href="${rUrl}">${rUrl}</a>`,
              ),
            ctaLabel: "🍽️ Explore Our AI Menu",
            ctaUrl: menuCta,
          }),
          text: plainBody([
            greet.text,
            "",
            `Confirmed at ${d.businessName} for ${d.when}${partyLabel}.`,
            "",
            `Menu: ${menuCta}`,
            `Reservation: ${rUrl}`,
          ]),
        };
      }
      if (template === "reservation_updated") {
        const subject = `🔄 New time from ${d.businessName}`;
        return {
          subject,
          html: brandedEmailHtml({
            title: subject,
            greetingHtml: greet.html,
            bodyHtml:
              p(`They suggested a better slot — your call.`) +
              highlightBox(`🕐 Proposed: ${strong(d.when)} at ${strong(d.businessName)}`) +
              p(`Tap below to accept or decline in one tap.`),
            ctaLabel: "✅ Review new time",
            ctaUrl: rUrl,
          }),
          text: plainBody([
            greet.text,
            "",
            `${d.businessName} proposed: ${d.when}`,
            "Accept or decline on your reservation page.",
            "",
            `View: ${rUrl}`,
          ]),
        };
      }
      if (template === "reservation_reminder") {
        const subject = `⏰ Almost time — ${d.businessName}`;
        return {
          subject,
          html: brandedEmailHtml({
            title: subject,
            greetingHtml: greet.html,
            bodyHtml:
              p(`Friendly nudge: your table is coming up.`) +
              highlightBox(
                `🗓️ ${strong(d.when)}${partyLabel ? ` · ${strong(`party of ${d.partySize}`)}` : ""}` +
                  `<br/>📍 ${strong(d.businessName)}`,
              ) +
              p(`See you there — can't wait. 🙌`),
            ctaLabel: "👀 Reservation details",
            ctaUrl: rUrl,
          }),
          text: plainBody([
            greet.text,
            "",
            `Reminder: ${d.businessName} on ${d.when}${partyLabel}.`,
            "",
            `View: ${rUrl}`,
          ]),
        };
      }
      const reason = d.reason?.trim();
      const subject = `😔 ${d.businessName} can't take that slot`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(
              `Tough news — ${strong(d.businessName)} can't host you for ${strong(d.when)}.`,
            ) +
            (reason
              ? highlightBox(`💬 ${strong(reason)}`)
              : highlightBox(`Try another time — they're worth it.`)) +
            p(`Open your page to see options or request again.`),
          ctaLabel: "👀 View reservation",
          ctaUrl: rUrl,
        }),
        text: plainBody([
          greet.text,
          "",
          `${d.businessName} can't take ${d.when}.${reason ? ` ${reason}` : ""}`,
          "",
          `View: ${rUrl}`,
        ]),
      };
    }
    case "queue_first_notify":
    case "queue_first_notify_menu": {
      const d = data as QueueJoinedData;
      const size = formatBookingSize(d.bookingSize);
      const wait = formatEstimatedWaitTime(d.estimatedWaitMinutes);
      const subject = `🎟️ You're #${d.queuePosition} at ${d.businessName}`;
      const menuCta = template === "queue_first_notify_menu";
      const ctaUrl = menuCta
        ? toPublicEmailUrl(
            d.menuSlug?.trim()
              ? merchantMenuUrl(d.menuSlug.trim(), customer.publicToken)
              : customerMenuUrl(customer.publicToken),
          )
        : hub;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`You're on the list — nice move.`) +
            highlightBox(
              `#️⃣ Spot ${strong(String(d.queuePosition))} · ${strong(size)}` +
                `<br/>⏱️ About ${strong(wait)} · ${strong(d.businessName)}`,
            ) +
            p(
              menuCta
                ? `Browse the menu while you wait — we'll ping you when it's your turn.`
                : `We'll ping you when it's your turn. Chill mode: on.`,
            ),
          ctaLabel: menuCta ? "🍽️ View our AI menu" : "📍 Live queue status",
          ctaUrl,
        }),
        text: plainBody([
          greet.text,
          "",
          `You're #${d.queuePosition} at ${d.businessName} (${size}).`,
          `Est. wait ${wait}.`,
          "",
          menuCta ? `Menu: ${ctaUrl}` : `Status: ${ctaUrl}`,
        ]),
      };
    }
    case "queue_call_now":
    case "queue_reminders_1":
    case "queue_reminder_2":
    case "queue_3_reminder": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      const isFirst = template === "queue_call_now";
      const subject = isFirst
        ? `📣 ${d.businessName} is READY for you!`
        : `⏰ Still waiting — ${d.businessName} is ready`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(
              isFirst
                ? `Your table's calling — time to hop over. 🏃‍♂️`
                : `Friendly bump — they're still holding for you.`,
            ) +
            highlightBox(
              `⚡ ${strong(d.businessName)} · ${strong(size)}`,
            ) +
            p(
              isFirst
                ? `Don't ghost them — head in now.`
                : `Make your move before the window closes.`,
            ),
          ctaLabel: isFirst ? "🚀 I'm heading in" : "📍 Open my ticket",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `${d.businessName} is ready for your party (${size}).`,
          "",
          `Details: ${hub}`,
        ]),
      };
    }
    case "queue_customer_skipped": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      const subject = `↪️ Spot skipped at ${d.businessName}`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`Your turn got passed — easy come, easy fix.`) +
            highlightBox(`📍 ${strong(d.businessName)} · ${strong(size)}`) +
            p(`Check your ticket for what's next, or rejoin if you still want in.`),
          ctaLabel: "👀 Check my ticket",
          ctaUrl: hub,
        }),
        text: plainBody([
          greet.text,
          "",
          `Your spot at ${d.businessName} (${size}) was skipped.`,
          "",
          `Details: ${hub}`,
        ]),
      };
    }
    case "queue_seated":
    case "seated_menu": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      const subject = `🪑 You're in at ${d.businessName}!`;
      const menuCta = template === "seated_menu";
      const ctaUrl = menuCta
        ? toPublicEmailUrl(
            d.menuSlug?.trim()
              ? merchantMenuUrl(d.menuSlug.trim(), customer.publicToken)
              : customerMenuUrl(customer.publicToken),
          )
        : hub;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: greet.html,
          bodyHtml:
            p(`Seated and sorted — enjoy every bite. 🍽️`) +
            highlightBox(`✨ ${strong(d.businessName)} · ${strong(size)}`) +
            p(
              menuCta
                ? `Order from the AI Menu whenever you're ready.`
                : `Thanks for hanging with the queue. Dig in!`,
            ),
          ctaLabel: menuCta ? "🍽️ View our AI menu" : "📍 Open ticket",
          ctaUrl,
        }),
        text: plainBody([
          greet.text,
          "",
          `You're seated at ${d.businessName} (${size}). Enjoy!`,
          "",
          menuCta ? `Menu: ${ctaUrl}` : `Details: ${ctaUrl}`,
        ]),
      };
    }
    case "birthday_bonus_stamps": {
      const d = data as BirthdayBonusStampsData;
      const subject = `🎂 Birthday double stamps at ${d.businessName}`;
      return {
        subject,
        html: brandedEmailHtml({
          title: subject,
          greetingHtml: `Happy birthday ${strong(name)}! 🎉`,
          bodyHtml:
            p(`Your day, your treat — make it count.`) +
            highlightBox(
              `🎁 Visit ${strong(d.businessName)} today for ${strong("2 stamps")} toward ${strong(d.rewardName)}` +
                `<br/><span style="font-weight:600;color:#3d5c52;">(usually just 1 — birthday magic)</span>`,
            ) +
            p(`Don't leave those bonus stamps on the table.`),
          ctaLabel: "🎁 Open loyalty card",
          ctaUrl: hub,
        }),
        text: plainBody([
          `Happy birthday ${name}! 🎉`,
          "",
          `Visit ${d.businessName} today for 2 stamps toward ${d.rewardName} (usually 1).`,
          "",
          `Card: ${hub}`,
        ]),
      };
    }
    default: {
      const _exhaustive: never = template;
      return _exhaustive;
    }
  }
}
