# Froq × Supabase setup

This turns the demo into a real multi-tenant SaaS: Postgres + Auth (phone OTP) +
Row-Level Security + Realtime + Storage.

## 1. Environment variables

Copy `.env.example` → `.env.local` and fill in from **Supabase → Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only, never shipped to the browser
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

On Vercel, add the same variables under **Project → Settings → Environment Variables**.

## 2. Run the migrations

In the Supabase dashboard **SQL editor**, run these files in order:

1. `migrations/0001_init.sql` — tables, RLS policies, stats view, triggers
2. `migrations/0002_functions.sql` — transactional RPCs (`join_merchant`, `approve_stamp`, …)
3. `migrations/0003_views.sql` — `customer_overview` read view

(Or with the CLI: `supabase link` then `supabase db push`.)

## 3. Enable phone auth

**Authentication → Providers → Phone**: enable it and connect an SMS provider
(Twilio, MessageBird, Vonage, or Twilio Verify). Without a provider, OTP codes
won't be delivered. For local testing you can use Twilio test credentials or
enable the dashboard's test OTP.

## 4. Create your first merchant owner

Merchants self-serve: a phone number logs in via OTP, and the **setup wizard**
calls `createMerchant`, which inserts a `merchants` row owned by that auth user.
No manual seeding needed — just log in with your phone and complete the wizard.

## 5. Realtime (optional, recommended)

To make approvals update live on the dashboard, enable Realtime for the
`approvals` table: **Database → Replication → supabase_realtime → add `approvals`**.
The client subscription is the next wiring step (see "Remaining work").

## Data model

| Table | Purpose |
|---|---|
| `merchants` | One row per shop (the tenant). Owned by an auth user. |
| `customers` | One row per (shop, customer). Links to an auth user when they log in. |
| `loyalty_cards` | Stamp progress + status per customer. |
| `visits` | One row per approved stamp — powers LTV and the weekly chart. |
| `approvals` | Pending stamp requests awaiting merchant approval. |
| `redemptions` | Reward claims. |

RLS guarantees a merchant only ever sees its own tenant's rows
(`auth_owns_merchant`), and a customer only sees their own (`auth_owns_customer`).

## Regenerate exact TypeScript types (recommended)

The hand-written `src/lib/supabase/database.types.ts` row interfaces are accurate,
but the Supabase CLI can generate the fully-typed schema (with relationships) so
you can re-enable the `<Database>` generic on the clients:

```
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

## Customer flow (live)

- `/join/<slug>` — scanning a shop's QR opens this. Phone OTP → name (new members) →
  `join_merchant`, then redirects to `/card/<slug>`.
- `/card/<slug>` — that shop's loyalty card only. Unauthenticated visitors are sent
  back to `/join/<slug>` to log in for that business.
  (creates a pending approval). The merchant approves from their dashboard and the
  stamp appears live (Realtime subscription on `approvals` + `loyalty_cards`).

## Remaining refinements

- Reward redemption: the customer's reward sheet shows a code (`FROQ-xxxxx`); a
  camera-based scan of the customer's reward QR should call `redeem_reward` from
  the merchant scanner (currently the scanner uses manual code entry).
- Move merchant logos from base64 (`logo_url`) to Supabase Storage.
- Multi-shop switcher (each shop is a separate card at `/card/<slug>`).
