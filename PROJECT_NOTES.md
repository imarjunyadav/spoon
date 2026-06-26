# Spoon — Project Notes

> Canonical reference for business rules, architecture, historical decisions, and known gaps.
> Keep this updated as the system evolves. Last verified against the live database: **2026-06-27**.

---

## 1. What Spoon is

Spoon is a **smart canteen ordering system for TCET**. Students order food from anywhere on campus
instead of queueing, pay online, and only walk to the counter once the food is ready — at which point a
**pickup slot number** is revealed for fast, low-confusion handover. The goal is to cut waiting time,
crowding, and miscommunication during peak hours.

- **Students**: log in with email OTP → browse menu → place an order → pay (Razorpay card or Spoon Coins
  wallet) → track in real time → tap "I'm here" at the counter → see their slot number → collect.
- **Canteen staff**: use a dedicated admin dashboard — incoming orders appear in a live queue; staff push
  orders kitchen → ready, manage stock, handle refunds, set kitchen capacity / no-show timers, and toggle
  "break time" to pause new orders.

### Rollout history
- Simulated inside the canteen first: students placed concurrent orders while staff learned the workflow
  and tuned settings (kitchen capacity, no-show timers).
- Then compared head-to-head against the traditional system during live peak hours — **two weeks each**.
- **Currently live with real students.** Razorpay is in **TEST mode**. Treat all production changes with
  caution (see §9).

### Business rules that matter
- **1 Spoon Coin = ₹1.** Coins are integer-only. They exist primarily to **refund** cancelled / no-show
  orders, and can be spent on future orders.
- **Slot-based pickup.** When staff mark an order "prepared", the system assigns the **lowest free slot**
  (1..`max_prepared_slots`). The slot is **hidden from the student until they confirm they're physically at
  the counter** (`/arrive`). Only one prepared order may hold a given slot at a time (enforced by a
  partial-unique DB index).
- **No-show handling.** A prepared order not collected within `no_show_timeout_minutes` can be cancelled by
  staff; the amount is **refunded to the student's wallet as coins**.
- **Break time.** When `is_break_time = 'true'`, the app refuses to start new orders (card and wallet),
  while letting in-flight orders finish.
- **Pre-orders** (scheduled ≥45 min ahead) are **designed but NOT active/live** on the web app. The
  `orders.preorder_time` column exists and some code references it, but the flow is not exposed to users.

---

## 2. Architecture & topology

```
Browser (PWA, vanilla JS)                 Supabase (Postgres + Realtime + Auth)
  - public/  (student app)        ┌──────────────────────────────────────────┐
  - admin/   (staff dashboard)    │  Tables, RLS, RPC functions (atomic ops)  │
        │  ▲                      └──────────────────────────────────────────┘
        │  │ realtime (anon key, menu_items/orders/system_settings)   ▲
        ▼  │                                                          │ service-role key
   ┌─────────────────────────────────────────────────────────────────┘ (bypasses RLS)
   │  Express backend (Node 20) on Google Cloud Run (asia-south1)
   │   - serves BOTH the REST API and the static frontend from one origin
   │   - routes/ (HTTP)   services/ (business logic)   middleware/ (auth)
   └───┬─────────┬──────────┬───────────┬───────────┬──────────────┐
       Razorpay  Redis      Gmail SMTP  Web Push     OpenWA         (Telegram REMOVED 2026-06)
       (payments) (Upstash: (OTP +      (VAPID)      (WhatsApp,
                  OTP+rate)  order email)             institution server later)
```

- **One origin serves everything.** `backend/server.js` serves the API under `/api/*` and the static
  frontend (`/public`, `/admin`, `/js`, `/css`) from the project root. The frontend therefore calls the
  backend **same-origin** (`API_BASE_URL` resolves to `''`). Custom domains: `spoon.tcetswb.org` (student),
  `admin.spoon.tcetswb.org` (staff), both fronting the same Cloud Run service
  (`spoon-backend-122591058801.asia-south1.run.app`).
- **Frontend is framework-free vanilla JS.** `js/core/config.js` fetches `/api/config` at load to get
  Supabase URL/anon key + Razorpay key id, then creates a Supabase client for realtime only.
- **Two separate auth systems** (see §4).
- **Backend uses the Supabase service-role key everywhere → RLS is bypassed** for all server logic. The
  browser only uses the anon key for realtime + direct `menu_items` reads.

### Key directories
| Path | What |
|---|---|
| `backend/server.js` | Express entry — middleware, route mounts, static serving, error handler |
| `backend/routes/` | HTTP endpoints (auth, payment, orders, wallet, admin, settings, push, health, config) |
| `backend/services/` | Business logic (payment validator, wallet, user, admin, email, webPush, whatsapp, redis OTP, notifications) |
| `backend/middleware/` | `userAuth` (students), `sessionAuth` (admins) |
| `backend/migrations/` & `backend/database/migrations/` | SQL migrations (TWO folders — see §8) |
| `js/pages/`, `js/auth/`, `js/core/`, `js/services/` | Student PWA |
| `js/admin/` | Admin dashboard (`admin-dashboard.js`, `timelineRenderer.js`) |
| `public/`, `admin/` | HTML |

---

## 3. Data model (live-verified 2026-06-27)

All tables are in Postgres (Supabase project `mnvxojjbbiqmymlatigh`). Backend accesses them with the
service-role key. Money movement happens **inside Postgres RPC functions** (atomic + idempotent), not in JS.

### Tables
- **`users`** (PK `email`): `name`, `is_admin`, `created_at`, `updated_at`, `active_session_token` (uuid,
  student session), `admin_session_token` (uuid, currently unused by the relaxed admin auth),
  `session_created_at`. ~42 rows.
- **`menu_items`** (PK `id` integer): `name`, `category`, `category_id` (text), `price` (**integer ₹**),
  `is_available` (boolean — stock is a simple ON/OFF toggle, **not** a numeric count). ~93 rows.
- **`orders`** (PK `id` **text**): `status`, `total` (numeric), `items` (jsonb), `customer_email`,
  `phone_number`, `verification_code`, `payment_method` (`RAZORPAY`|`WALLET`), `razorpay_payment_id`,
  `slot_number`, audit columns `kitchen_at/by`, `prepared_at/by`, `completed_at/by`, `cancelled_at/by`,
  `arrived_at`, `cancel_reason`, `refund_amount`, `is_acknowledged` (admin audio-alert ack).
  - `id` is the **Razorpay payment id** for card orders, or `wallet_<ts>_<rand>` for wallet orders.
  - **Deprecated/archived v1 columns kept on purpose** (old pre-order cancellation flow): `cancellation_reason`
    (superseded by `cancel_reason`), `ready_at`, `picked_up_at`, `preorder_time`. Do not delete — see §8.
- **`payment_transactions`** (PK `id` serial): full Razorpay audit — `razorpay_payment_id` (UNIQUE,
  idempotency key), `razorpay_order_id`, `razorpay_signature`, `amount` (paise), `currency`, `status`,
  `user_email` (FK→users), `order_id`, `webhook_received/_timestamp`, `signature_verified`, `error_reason`.
  ~335 rows.
- **`wallets`** (PK `id` uuid): `user_email` (UNIQUE), `balance` (integer, `>= 0`). ~33 rows.
- **`wallet_transactions`** (PK `id` uuid, immutable ledger): `wallet_id` (FK→wallets), `type`
  (`CREDIT`/`DEBIT`), `amount`, `reason` (`REFUND`/`PURCHASE`/`ADMIN_CREDIT`/`ADMIN_DEBIT`),
  `reference_order_id`, `description`, `balance_after`. ~501 rows.
- **`system_settings`** (PK `key`): `value` (text), `updated_at`. Live rows:
  `max_prepared_slots=8`, `no_show_timeout_minutes=15`, `is_break_time=false`.
- **`push_subscriptions`** (PK `id` bigint): `user_email`, `endpoint` (unique target), `keys` (jsonb). ~5 rows.

### RPC functions (the atomic core)
- **`confirm_payment_and_order(...)`** — Razorpay checkout. Idempotent on `razorpay_payment_id` (row lock +
  existence check); inserts both the `payment_transactions` row and the `orders` row in one transaction.
- **`checkout_with_wallet(...)`** — wallet checkout. Locks the wallet row `FOR UPDATE`, validates balance,
  debits, writes the ledger row, inserts the order — all atomic. Idempotent on `orders.id`.
- **`wallet_credit_coins(...)`** — refund / admin credit. Idempotent on `reference_order_id` for refunds.
- **`assign_prepared_slot_atomic(p_order_id, p_max_slots, p_admin_email)`** — assigns the lowest free slot
  and flips the order to `prepared`. Concurrency-safe via the partial-unique index
  `idx_orders_slot_prepared` on `(slot_number) WHERE status='prepared'`.
  **⚠️ This function exists ONLY in the live DB — there is no SQL file for it (see §8).**

### RLS & realtime
- RLS **enabled** (migrations): `users`, `payment_transactions`, `wallets`, `wallet_transactions`.
- RLS **not enabled** (rely on service-role backend + anon read of `menu_items`): `orders`, `menu_items`,
  `system_settings`, `push_subscriptions`.
- Realtime publication: `users` and `system_settings` added in SQL; **`orders` and `menu_items` are
  subscribed to by the dashboard but were added to the publication directly in Supabase, not via migration.**

---

## 4. Auth (two separate systems — do not conflate)

- **Students** → `middleware/userAuth.js` (`requireAuth`). Custom headers `x-user-email` + `x-session-token`.
  Validated by string-comparing `users.active_session_token`. Tokens are opaque `crypto.randomUUID()` minted
  at OTP verify / signup. **Sessions do not expire** — this is an intentional product choice (frictionless,
  Zomato/Swiggy-style). `session_created_at` is stored but not enforced.
- **Admins** → `middleware/sessionAuth.js` (`requireAdminSession`). Standard `Authorization: Bearer <JWT>`,
  validated via **Supabase Auth** (`auth.getUser`) + `users.is_admin = true`. This is the only place real
  JWTs are verified. (The single-device admin check was deliberately relaxed to JWT-only.)
- Client-side login flow: `login.html` → `otp.html` → (existing user → app) / (new → `signup.html`). Auth
  state lives in `localStorage` (`spoon-is-logged-in`, `spoon-session-token`, `spoon-user-email`, ...).
  `js/core/session-guard.js` heartbeats `/api/auth/validate-session` every 15s.

---

## 5. Core flows

- **Order lifecycle:** `pending → kitchen → prepared → completed`, plus terminal `cancelled`. All admin
  transitions use conditional `.eq('status', <expected>)` updates (optimistic concurrency → 409 on conflict).
- **Card payment:** `cart.js` → `POST /api/payment/create-order` (server re-validates prices vs `menu_items`,
  rejects on break time) → Razorpay checkout → `POST /api/payment/verify-payment` (HMAC signature check,
  **timing-safe**) → `confirm_payment_and_order` RPC. A Razorpay **webhook** (`/api/payment/webhook`,
  raw-body HMAC, `timingSafeEqual`) is the backup path; it returns 500 on processing errors so Razorpay retries.
- **Wallet payment:** `POST /api/wallet/pay` (idempotency key, server price re-validation) →
  `checkout_with_wallet` RPC.
- **Prepared → arrive → collect:** staff `mark-prepared` (slot assigned) → student taps "I'm here"
  (`/arrive`, reveals slot) → staff `complete`. No-show → `cancel-no-show` (refund to wallet, with app-level
  rollback if the credit fails).
- **Realtime:** student menu stock + break-time banner use Supabase realtime; order status + wallet use HTTP
  polling. Admin dashboard uses Supabase realtime on `orders`/`menu_items`/`system_settings` with
  reconnect/backoff + a local WebAudio alarm for new orders (not OS push).

---

## 6. External integrations

| Integration | Used for | Config (env) | Prod status |
|---|---|---|---|
| **Razorpay** | Card payments | `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Live, **TEST mode** |
| **Supabase** | DB, realtime, admin auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Live |
| **Redis (Upstash)** | OTP storage + OTP rate-limit | `REDIS_URL` | Live (in-memory fallback if down) |
| **Gmail SMTP** | OTP email + order-ready email | `SMTP_EMAIL`, `SMTP_PASSWORD` (app password) | Live |
| **Web Push (VAPID)** | Admin new-order + user ready/cancel push | `VAPID_PUBLIC_KEY/_PRIVATE_KEY/_EMAIL` | Live |
| **OpenWA (WhatsApp)** | Order-ready WhatsApp message | `OPENWA_API_URL/_API_KEY/_SESSION_NAME`, `WHATSAPP_ENABLED` | **Off in prod** (see below) |
| ~~Telegram~~ | ~~Admin alerts~~ | — | **REMOVED 2026-06** (was experimental) |

### OpenWA / WhatsApp — how to enable in production (later)
The WhatsApp code is fully env-driven and degrades gracefully (skips silently if disabled/unreachable; never
blocks orders). To turn it on when the institution OpenWA server exists:
1. Set `OPENWA_API_URL` to the institution server (not localhost), plus `OPENWA_API_KEY`,
   `OPENWA_SESSION_NAME`, `WHATSAPP_ENABLED=true` in `backend/.env`.
2. **Add `OPENWA_API_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_NAME`, `WHATSAPP_ENABLED` to the forwarded-keys
   list in `deploy.ps1`** — they are NOT forwarded today, so WhatsApp stays off in prod until added.

---

## 7. Deployment

- **Platform:** Google Cloud Run, region `asia-south1`, service `spoon-backend`. Public
  (`--allow-unauthenticated`), `min-instances 0`, `max-instances 3`, 512Mi / 1 CPU, concurrency 80, port 7070.
- **Cold starts are accepted for now** (personal GCP account, cost-conscious). Revisit `min-instances` when
  moving to institutional infra.
- **Deploy:** `./deploy.ps1` — reads `backend/.env`, forwards a **fixed subset** of vars to Cloud Run, and
  runs `gcloud run deploy --source .` (Cloud Build → Docker `node:20-slim`).
- **⚠️ deploy.ps1 only forwards a subset of env vars.** It forwards Supabase, Razorpay, SMTP, Redis, VAPID
  (and copies `RAZORPAY_SECRET` → `RAZORPAY_WEBHOOK_SECRET`). It does **NOT** forward `OPENWA_*` /
  `WHATSAPP_ENABLED` (and formerly not `TELEGRAM_*`). So integrations not in that list are silently disabled
  in production regardless of `.env`.
- **Docker:** `Dockerfile` (`node:20-slim`, `npm install --only=production`, runs `node backend/server.js`).
  `docker-compose.yml` is for local dev only.
- **Secrets:** `backend/.env` is **gitignored and NOT committed** (verified). Only `backend/.env.example`
  (template) is tracked. `schema_dump*.sql` is also gitignored.

---

## 8. Historical decisions & schema evolution

- **v1 → v2 (`20260224_v2_schema.sql`):** introduced the slot-based counter-queue. Lowercased order statuses
  (`PLACED/PREPARING/...` → `pending/kitchen/prepared/completed/cancelled`), added per-step audit columns +
  `slot_number` + the partial-unique slot index, added `system_settings` (seeded `max_prepared_slots=10`,
  `no_show_timeout_minutes=10`), dropped the old `kitchen_told_items` table.
- **Phase 7 "enterprise checkout" (`20260316_*`):** moved checkout into an ACID stored procedure so a Node
  crash can't orphan a payment. v1 of phase7 added numeric stock reservations; **v2 rolled that back** (Spoon
  uses ON/OFF stock, not inventory counts) and `..._fix_duplicate_rpc.sql` dropped the leftover function overload.
- **Wallet atomicity (`20260330`):** `checkout_with_wallet` + `wallet_credit_coins` replaced fragile
  multi-step JS with row-locked, idempotent RPCs.
- **Telegram removal (2026-06):** Telegram admin alerts were an experimental channel; removed entirely from
  code, env, and docs. Admin alerting is now Web Push + the dashboard's realtime + audio alarm.

### ⚠️ Migration hazards (known, not yet fixed)
- **Two migration folders:** `backend/database/migrations/` (numbered `001/002/003`, users+payments) and
  `backend/migrations/` (dated, RLS/realtime/wallet/v2/phase7). No migration runner; ordering is by convention.
- **Date-prefix vs logical-order mismatch:** some `2024xxxx` files depend on tables created by `2026xxxx`
  files. A naive lexical apply would break.
- **`schema_dump_final.sql` is empty (0 bytes).** Not a source of truth.
- **Live-only objects with no SQL anywhere:** the base `orders`, `menu_items`, `push_subscriptions` tables
  and the `assign_prepared_slot_atomic` function exist only in the live DB. A fresh rebuild from the existing
  migration files alone would be **incomplete**. See `backend/database/schema/` for a consolidated baseline
  (generated 2026-06) intended to close this gap for fresh setups — verify the reconstructed
  `assign_prepared_slot_atomic` against live before relying on it.

---

## 9. Production-safety rules (for any future change)

Spoon is **live with real students**. Before making any change:
1. Verify it does **not** affect order flow, payments, database integrity, or user experience.
2. Do **not** modify the live schema unless there is zero risk. Generating migration *files* for fresh
   setups is fine; running DDL against prod is not (without explicit go-ahead + backup).
3. If there is any risk, **document it and skip** rather than forcing it.
4. There is **no automated test suite** — verify changes by booting the server and exercising endpoints.
5. Keep archived/deprecated v1 columns (`cancellation_reason`, `ready_at`, `picked_up_at`, `preorder_time`)
   — they may be reused for the pre-order flow.

### Known gaps intentionally left as-is
- Student sessions never expire (product choice — frictionless UX).
- Cloud Run cold starts (`min-instances 0`) — cost choice; revisit on institutional infra.

### Open risks worth tracking (not yet addressed)
- `verify-payment` is intentionally unauthenticated (relies on Razorpay signature) — acceptable but noted.
- OTP/rate-limit state is per-instance when Redis is down (multi-instance Cloud Run could split state).
- App-level (non-transactional) rollback on no-show/force-cancel refund failures.
