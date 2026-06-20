# Froq × Supabase setup

This turns the demo into a real multi-tenant SaaS: Postgres + Auth (phone, via
APITxT SMS OTP) + Row-Level Security + Realtime + Storage.

## 1. Environment variables

Copy `.env.example` → `.env.local` and fill in from **Supabase → Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only, never shipped to the browser
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# APITxT SMS OTP (server-only)
APITXT_AUTH_KEY=<your apitxt authkey>
OTP_COUNTRY_CODE=91
OTP_HASH_SECRET=<long random string — openssl rand -hex 32>
```

On Vercel, add the same variables under **Project → Settings → Environment Variables**.

## 2. Run the migrations

In the Supabase dashboard **SQL editor**, run these files in order:

1. `migrations/0001_init.sql` — tables, RLS policies, stats view, triggers
2. `migrations/0002_functions.sql` — transactional RPCs (`join_merchant`, `approve_stamp`, …)
3. `migrations/0003_views.sql` — `customer_overview` read view
4. `migrations/0004_otp.sql` — `otp_codes` table + `auth_user_id_by_phone` lookup RPC

(Or with the CLI: `supabase link` then `supabase db push`.)

## 3. Auth: APITxT SMS OTP (not Supabase's built-in OTP)

OTP delivery and verification are handled by the app, **not** Supabase's phone
provider:

- `POST /api/send-otp` generates a 6-digit code, HMAC-hashes it into `otp_codes`
  with a 5-minute expiry, and sends it via the APITxT Unified OTP API (system
  default SMS template). The APITxT `request_id` is stored for tracking.
- `POST /api/verify-otp` validates the code against the stored hash/expiry, then
  finds-or-creates the auth user for that phone and mints a Supabase session.

Supabase config required:

- **Authentication → Providers → Phone**: enable the phone provider so phone
  users can exist and sign in. You do **not** need to configure an SMS provider
  in Supabase — APITxT sends the messages. Disable "Confirm phone" / OTP expiry
  concerns are moot since users are created with `phone_confirm: true`.
- Rate limit: APITxT allows max 3 OTP requests per number per minute; the
  `/api/send-otp` route enforces this plus a 30-second resend cooldown.

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
