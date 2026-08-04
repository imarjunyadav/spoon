# 🥄 Spoon — Institution Launch Readiness Dossier

_Campus food-ordering system for TCET · compiled 2026-07-05 · covers Node/Express PWA + Supabase + Razorpay (LIVE) + Upstash + Gmail SMTP_

> ## ⚖️ VERDICT
> **NO-GO on a same-day institution-server (on-prem) cutover.**
> **GO for the institution-wide launch — on the already-proven Google Cloud Run deploy, with `spoon.tcetswb.org` / `admin.spoon.tcetswb.org` pointed at it via DNS/domain-mapping.**
> Stage the on-prem move as a deliberate Week-2+ project with its own firewall + webhook + load testing.

### How to use this document
- **Part 1 (Decision, Blockers & Corrections)** — read first. It reconciles the detailed audits and is **authoritative where they conflict** (it was re-verified against the live code).
- **Part 2 (Detailed Reference)** — the six deep-dive audits. **Section A (IT Intake Sheet) is the part to hand to your college IT department.**
- Severity tags used throughout: 🔴 **launch-blocker** · 🟡 important · ⚪ nice-to-have.

### ⏱️ Minimum must-do BEFORE opening to everyone (from Part 1 §4)
1. 🔴 Move OTP email **off consumer Gmail** (institution SMTP relay / Workspace / SendGrid) — Gmail's ~500/day cap hard-fails logins within the first lunch hour.
2. 🔴 Set **LIVE** Razorpay keys + the **real** webhook secret (not a copy of the API secret); run one ₹1 end-to-end payment.
3. 🔴 Raise the **per-IP rate-limit ceilings** and exempt `/api/payment/webhook` (thousands of students behind campus NAT share one IP bucket).
4. 🔴 Publish the **5 Razorpay-mandatory policy pages** (Privacy, Terms, Refund/Cancellation, Shipping/Pickup, Contact) + a signup consent checkbox.
5. 🔴 Confirm **Supabase Pro** (no auto-pause, backups on) + **Upstash PAYG** are actually enabled and the project is **not paused**.
6. 🔴 Set `NODE_ENV=production` explicitly; keep serving on Cloud Run; soft-launch to one department first.

---

# PART 1 — Decision, Blockers & Corrections
_(The completeness critic re-verified the load-bearing claims against the live repo. This layer overrides Part 2 where they differ.)_


# Spoon Launch-Readiness — Completeness Critique & Go/No-Go

*Critic's note: I re-verified the load-bearing claims against the live repo (`backend/server.js:106-167, 254-265, 301`; `backend/services/emailService.js:11-19`). Two dossier claims are imprecise and one severity is overstated — flagged in §2. Everything else in the six sections is broadly sound; my job here is what they missed or under-called.*

---

## 1) 🔴 TOP LAUNCH-BLOCKERS (ranked, most dangerous first)

| # | Blocker | Why it stops/endangers launch | Fastest SAFE fix |
|---|---------|-------------------------------|------------------|
| **1** | **Same-day cutover to an unverified on-prem server** | Every external dependency (Supabase 443, Upstash 6379-TLS, Razorpay 443, Gmail 587) and the *inbound* Razorpay webhook must traverse a locked-down campus firewall that has **never been tested**. Any one silently fails → login/payments dead, no rollback rehearsed, on the highest-traffic day of the app's life. | **Do NOT cut over tomorrow.** Keep the proven Cloud Run deploy; point `spoon.` / `admin.spoon.tcetswb.org` at it via domain mapping (see §4). Stage on-prem as a Week-2 project. |
| **2** | **Gmail OTP cap (~500/day) vs thousands of logins — and it hard-fails** | One consumer Gmail account, shared between OTP *and* order-ready emails. `send-otp` **awaits SMTP and returns HTTP 500 `EMAIL_SEND_FAILED`** (`auth.js`) — quota exhaustion = every new login hard-fails, not slow-fails. Near-certain within the first lunch hour. Independent of where the app runs. | Switch the transporter off Gmail **tonight**: institution SMTP relay (best, high quota, SPF/DKIM already aligned) or Workspace/SendGrid. `emailService.js:11-19` hardcodes `host:'smtp.gmail.com'` — this is a real (small) code change; add `SMTP_HOST`/`SMTP_PORT`. **Send one real OTP and confirm inbox (not spam) before opening.** |
| **3** | **LIVE Razorpay path has never run in prod + webhook-secret trap** | Memory says Razorpay is currently TEST-mode; flipping to `rzp_live_` keys means the money path is untested in prod. `deploy.ps1:60-63` *derives* `RAZORPAY_WEBHOOK_SECRET` from the API secret — wrong unless they happen to match → HMAC rejects every webhook → **money captured, order never confirmed.** | Set `RAZORPAY_WEBHOOK_SECRET` to the **actual dashboard webhook secret**. Run **one ₹1 LIVE end-to-end**: pay → order shows Confirmed → webhook 200 in logs → wallet refund works. Resolve *which path confirms orders* (see §2 gap 6). |
| **4** | **Per-IP rate limiters collide with campus NAT** | Confirmed `apiLimiter` 300/min and `paymentLimiter` 50/15min per IP (`server.js:154-167`), and `paymentLimiter` is mounted on the `/api/payment` prefix **so it covers `/webhook`**. Thousands of students behind a few NAT IPs share one bucket → mass `429` at lunch; Razorpay's own IPs get throttled → missed confirmations. | Tonight: **raise ceilings dramatically** (API → thousands, payment → hundreds) — the lowest-risk fix — **and** `skip: req.path==='/webhook'` on the payment limiter. ⚠️ Do **not** naively key by `x-user-email` on `send-otp` (see §2 gap 3). |
| **5** | **Razorpay live-account mandatory policy pages missing** | 4 of 5 required pages (Terms, Refund, Shipping/Pickup, Contact) don't exist; Privacy is placeholder; no consent capture; no Grievance Officer. Razorpay audits live sites and can **hold settlements** → money collected but not paid out mid-launch. Applies regardless of hosting. | They're static HTML — **build all 5 in `public/` tonight**, link in a pre-login footer, paste URLs into the Razorpay dashboard, add the unticked consent checkbox to `signup.html`. |
| **6** | **Free-tier Supabase/Upstash: auto-pause + command cap** | Supabase free auto-pauses after 7 days idle → **cold DB / failed first requests** on launch morning; Upstash free command cap (~5 cmds/login) exhausts → OTP store fails open to per-instance memory. | Confirm **Supabase Pro** (no auto-pause, daily backups on) and **Upstash PAYG** are actually enabled tonight (billing action, not a checkbox) — and that the project is **not currently paused**. |
| **7** | **Outbound firewall + inbound webhook (only if on-prem)** | On a locked-down box the four egress ports and the public inbound 443 webhook are blocked by default → silent total failures. **Moot if you stay on Cloud Run.** | If forced on-prem: run the §D/§4 egress test *and* fire a Razorpay test webhook **before** opening. Otherwise Cloud Run already handles TLS, autoscale, restart, and public inbound. |
| **8** | **Prod config / secrets / TLS hygiene** | Dev `docker-compose.yml` sets `NODE_ENV=development` → CORS reflects any origin **and** bind-mounts `.env` into the container. Secrets must stay off the express-static tree. TLS must cover both hostnames. | `NODE_ENV=production` explicitly; **never** `docker compose up` the dev file; verify certs + 80→443; keep the env file outside the served root. |

> **Session no-expiry** (stolen `x-session-token` works forever) is real but **low immediate risk** for a fresh launch with ~no existing sessions — adding a 30-day TTL now is safe (no mass logout). Do it if you have spare cycles; otherwise record as a written accepted risk. Not a tomorrow blocker.

---

## 2) GAPS / ERRORS the six sections missed, got wrong, or under-stated

1. **The dossier never resolves its own central contradiction.** Sections 1–5 (IT intake, env, deployment, security, compliance) are written as if the on-prem cutover *is happening tomorrow*; Section 6 argues *don't cut over, stay on Cloud Run*. The reader is handed two mutually exclusive plans with no reconciliation. **This is the biggest completeness gap** — the go/no-go (§4) must be decided first, because it moots half of sections 1, 5, and the entire firewall ask.

2. **The "`/backend/.env` is publicly downloadable" claim is likely a false alarm — and it hides the real exposure.** `express.static(rootDir)` (verified `server.js:254-257`) serves the **repo root** with default options, and serve-static defaults `dotfiles:'ignore'` → dotfiles (`.env`, `.git`) return **404**. So the repeated "curl `/backend/.env`" scare (and the reassuring "confirm it 404s" check) is misleading. The **actual** unflagged exposure: every *non-dotfile* in the repo is served — `deploy.ps1`, `package.json`, `package-lock.json`, `Dockerfile`, and all of `backend/**` (routes, services, `server.js`) + `js/**` + `sw.js`. An attacker can download your **entire server source and `deploy.ps1`** (which documents the webhook-secret derivation and env layout) — free recon. **Fix: serve only `public/`, `js/`, `css/`, `assets/` explicitly, not the repo root.**

3. **The proposed rate-limit fix opens an OTP-email-bombing / quota-burn vector.** Both the security and scale sections recommend `keyGenerator: req.headers['x-user-email'] || req.ip`. But `x-user-email` is **client-supplied and only DB-validated on protected routes** (`userAuth`). On `/api/auth/send-otp` — the most abusable route, which sends *real* email and burns blocker #2's quota — an attacker rotating a random header value gets unlimited fresh buckets, defeating the global limiter. The per-email 5/15min store limit caps repeats to *one* address but not fan-out across many. **Keep a real per-IP (or per-target-email) cap on `send-otp`; only key *authenticated* routes by a server-validated identity.**

4. **Open-CORS severity is overstated.** Auth is via custom headers (`x-user-email`, `x-session-token`) + `localStorage`, **not cookies** (confirmed: `allowedHeaders` + no cookie auth). Classic CSRF needs ambient cookie credentials, and cross-origin JS can't read another origin's `localStorage`/token — so dev-mode reflected CORS is **not** the "CSRF/credential-leak hole for a payments app" the security section frames. Still close it (`NODE_ENV=production`), but don't rank it catastrophic. (Aside: `allowedHeaders` omits the custom auth headers entirely — harmless for the same-origin app, but would break any genuine cross-origin API call.)

5. **Monitoring has a blind spot for Supabase-down.** `/api/health` returns **200** on `degraded` (Supabase down, Redis up). A plain "alert on non-200" uptime check (as recommended) will **stay green while orders can't persist and money is being taken.** Monitoring must parse the JSON `status` field and page on `degraded` too — not just the HTTP code.

6. **Payment-confirmation authority is left ambiguous — and it changes blocker #3's severity.** The dossier says both "the webhook drives `confirm_payment_and_order`" *and* describes a synchronous client-driven `verify-payment` path, without stating which actually confirms the order. If `verify-payment` confirms synchronously and the webhook is a reconciliation backstop, a wrong webhook secret is 🟡; if the webhook is the sole confirmation, it's 🔴. **Resolve this before launch.** Related unflagged gap: **there is no mentioned reconciliation/admin tool** to recover "money captured, order not created" — a real operational hole for live money on day one.

7. **Service-worker stale cache on cutover/redeploy is unaddressed.** `sw.js` caches assets. Any student who previously loaded prod may be served **stale HTML/JS (including old `/api/config` or payment JS)** after a domain/backend change or new deploy. Needs a SW cache-version bump on launch; otherwise a slice of users runs old code against new infra.

8. **The IT sizing rationale ignores the continuous heartbeat floor.** Section 1 sizes for "meal-time bursts, tens-to-low-hundreds concurrent," but the 15s `validate-session` heartbeat is a **continuous ~200 req/s floor at 3,000 logged-in tabs** (Section 6's own math), each a Supabase read + limiter check on one event loop — independent of active use. This makes raising `HEARTBEAT_INTERVAL` 15s→60s a **must-do**, not a nice-to-have, before any single-instance launch, and means sizing should be based on the heartbeat floor.

9. **One-active-device × heartbeat = day-one support load.** A student on phone + lab PC triggers constant token rotation → the older session's 15s heartbeat fails every cycle → forced-logout loop. Not security, but a real UX/scale issue at institution scale that no section calls out.

10. **The dossier prescribes a large volume of untested launch-eve code changes** (engines pin, Dockerfile rewrite, loopback bind, CSP, session TTL, rate-limit keyGenerator, webhook skip, SMTP host) without prioritizing. **Shipping that many edits the night before is itself a top risk.** Minimum-viable set for tomorrow: SMTP quota fix, rate-limit ceilings + webhook exemption, `NODE_ENV=production`, live Razorpay keys + correct webhook secret, policy pages. Defer CSP/session-TTL/Dockerfile-hardening/engines-pin to post-launch if staying on Cloud Run.

11. **Razorpay account *activation* (KYC + settlement bank) is never confirmed** — only the policy pages. Approved KYC and a configured settlement account are prerequisites for funds to actually settle; policy pages are necessary but not sufficient.

---

## 3) 30-MINUTE PRE-LAUNCH SANITY CHECKLIST (run right before flipping on)

Against the **live URL** you're about to open (Cloud Run behind `spoon.tcetswb.org`):

1. **Health:** `curl -s https://spoon.tcetswb.org/api/health` → `200 {"status":"healthy"}` (Redis **and** Supabase up — not `degraded`).
2. **Live keys reach the browser:** `curl -s https://spoon.tcetswb.org/api/config` → `RAZORPAY_KEY_ID` starts `rzp_live_` (not `rzp_test_`), correct `SUPABASE_URL`/anon.
3. **CORS closed / prod on:** `curl -sI -H "Origin: https://evil.com" https://spoon.tcetswb.org/api/config` → **no** `Access-Control-Allow-Origin: https://evil.com` echoed.
4. **OTP delivers for real:** trigger one OTP to a test inbox → arrives in seconds, **inbox not spam** (validates the SMTP switch, quota, SPF/DKIM). Do this **once** — don't hammer `send-otp`.
5. **Live money end-to-end (the single most important check):** place one ₹1 order → Razorpay LIVE capture → order shows **Confirmed** → webhook **200** in logs → wallet refund path works.
6. **Webhook config:** Razorpay dashboard webhook = `https://spoon.tcetswb.org/api/payment/webhook`, secret **matches env**, `payment.captured` subscribed; fire a test webhook → **200** (not 401/429).
7. **Rate-limit sanity:** confirm ceilings raised + webhook exempt are actually deployed (hit `/api/health` rapidly from one IP without tripping `429`).
8. **Infra tiers live:** Supabase **not paused**, on Pro, backups on; Upstash on PAYG (not over cap).
9. **Policy pages:** all 5 load **logged-out**, linked in footer, and URLs pasted in Razorpay dashboard.
10. **TLS + redirect:** valid cert for **both** `spoon.` and `admin.spoon.`; `curl -I http://spoon.tcetswb.org` → 301→https.
11. **Monitoring armed:** UptimeRobot/BetterStack on `/api/health` alerting your phone — and configured to alert on the JSON `status` (`degraded`/`unhealthy`), not just non-200.
12. **Rollback ready:** last-known-good Cloud Run revision named on the runbook; traffic-shift command pre-typed; DNS TTL = 300s. Named on-call human (you) with laptop + `gcloud` access.

---

## 4) GO / NO-GO

**NO-GO on a same-day institution-server cutover. GO for launch — on the proven Cloud Run deploy, with the institution subdomain pointed at it.**

A same-day on-prem migration stacks every untested unknown (campus egress for SMTP 587 / Redis 6379-TLS / Supabase 443, *inbound* webhook reachability through NAT/firewall, TLS provisioning, single-instance-no-autoscale, root container, dev-compose trap) onto the highest-traffic day, with no rehearsed rollback. Cloud Run already gives you TLS, autoscaling, restart-on-crash, working public inbound (webhook), and a passed pentest. The upside of moving tonight is zero; the downside is a total outage during launch.

**Recommended path:**

1. **Tonight — apply only the must-fix set** (blockers #2, #3, #4, #5, #6, #8; keep the code diff minimal): SMTP off Gmail, rate-limit ceilings + webhook exemption, `NODE_ENV=production`, live Razorpay keys + real webhook secret, Supabase Pro + Upstash PAYG, 5 policy pages. Redeploy to Cloud Run with `--min-instances 2 --max-instances 20`.
2. **Point the institution DNS at Cloud Run** via `gcloud run domain-mappings create` for `spoon.` and `admin.spoon.tcetswb.org` — keeps the institution brand, zero server migration.
3. **Run the §3 checklist**, then **soft-launch to one batch/department (a few hundred)** for 1–2 hours; watch health, Cloud Run instance count, Upstash commands, Supabase CPU, email send count, and the live-payment path.
4. **Open to the whole college** only after the slice is green.
5. **On-prem = a deliberate Week-2+ migration** with its own egress verification, inbound-webhook test, TLS, load test, and rehearsed rollback — never on launch day.

**Stakeholder caveat:** if TCET IT *mandates* on-prem for data-residency policy, do **not** silently override it — get explicit IT sign-off that DNS→Cloud Run is an acceptable interim, and commit to the staged on-prem move. If IT refuses any interim and demands on-prem tomorrow, the correct call is to **slip the full launch and run a tiny pilot only** — do not open to thousands on an unverified box. Note the ~₹PII lives in Supabase/Upstash cloud regardless of where the compute runs, so "on-prem" does not by itself satisfy a data-residency requirement — surface that to IT now.


---

# PART 2 — Detailed Audit Reference

> Where any detail below conflicts with Part 1, **Part 1 wins**. In particular, see **Part 1 §2** for specific corrections (e.g., the `.env`-download claim is a false alarm but the whole source tree is served; do **not** key the `send-otp` rate limiter by the client `x-user-email` header).



---

## A. Institution IT Intake Sheet (Q → correct answer)

# Institution IT Intake Sheet — Spoon (spoon.tcetswb.org)

> Hand this section to TCET IT/Infrastructure. Every answer is grounded in the real repo (`backend/server.js`, `Dockerfile`, `docker-compose.yml`, `deploy.ps1`, `package.json`). Urgency tags: 🔴 LAUNCH-BLOCKER · 🟡 important · ⚪ nice-to-have.

---

## A. Application Profile

| # | IT Question | Spoon-Specific Answer |
|---|---|---|
| A1 | What kind of application is this? | Single-process **web application + JSON API in one Node.js server**. It serves BOTH the REST API (`/api/*`) and the static PWA + admin dashboard via `express.static` (`server.js:257`). No separate frontend server. |
| A2 | Language / runtime? | **Node.js 20** (Docker base `node:20-slim`, `Dockerfile:3`). ⚠️ `package.json` has **no `engines` pin** — if IT runs it outside Docker on a different Node version, behavior is untested. Pin Node 20.x. |
| A3 | Framework / key libraries? | Express 4.21, Helmet, cors, express-rate-limit, @supabase/supabase-js, ioredis, razorpay, nodemailer, web-push, dotenv (`package.json:21-33`). |
| A4 | How is it started? | Entry point `node backend/server.js` (`package.json` `start`, `Dockerfile:23` CMD). Listens on `process.env.PORT` (default **7070**, `server.js:89`). |
| A5 | Preferred run method on the institution server? | **Docker container** (image builds from included `Dockerfile`) behind a reverse proxy — recommended. Alternative: bare `node` under a **systemd unit** (unit file provided in §I). Do NOT use `docker-compose.yml` as-is — it is **DEV-only** (`NODE_ENV=development`, bind-mounts the whole source tree `.:/app`, `restart: always`). 🔴 |
| A6 | Does it require root? | **No — and it must NOT run as root.** ⚠️ The current `Dockerfile` runs as **root** (no `USER` directive) and binds a privileged-capable process. Fix before handoff: add a non-root user, or run the container with `--user 1000:1000`. The app itself needs no root, no privileged ports (it uses 7070, not 80/443). 🔴 |
| A7 | Is it stateless? | **Yes, effectively stateless** — no local database, no persistent local disk needed. All state lives in Supabase (Postgres) and Upstash (Redis). ⚠️ One exception: the **email-OTP rate-limit fallback** uses an in-process `Map` (`otpStore.js:37`) — fine for a single instance, but do **not** run multiple replicas behind a load balancer without sticky sessions or Redis-only mode, or rate limiting becomes inconsistent. Run **one instance** for launch. 🟡 |
| A8 | Any background jobs / cron? | None required. WhatsApp/OpenWA code exists but is **disabled in prod** (not in the deploy env allowlist, `deploy.ps1:54`). Web-push runs inline on order events. |
| A9 | Where are secrets stored? | `backend/.env` (gitignored), loaded via `dotenv`. ~15 secrets (see §D-secrets). Must be provided as env vars or a mounted secret file on the institution server — **never commit to their config repo**. 🔴 |
| A10 | Health check endpoint? | `GET /api/health` (`server.js:214`). Use for reverse-proxy / load-balancer liveness probes. ⚠️ The `Dockerfile` has **no `HEALTHCHECK`** — add one or configure the probe in the orchestrator. 🟡 |

---

## B. Server Sizing (a few thousand users)

| Resource | Minimum (works) | **Recommended** | Notes |
|---|---|---|---|
| vCPU | 1 vCPU | **2 vCPU** | Node is single-process (`server.js` runs one event loop). Prod on Cloud Run today uses `--cpu 1 --concurrency 80` (`deploy.ps1:81`). 2 vCPU gives headroom for TLS termination in the reverse proxy on the same box. |
| RAM | 512 MB | **2 GB** | Cloud Run runs it in `512Mi` today (`deploy.ps1:81`). 2 GB covers Node heap + Nginx + OS + burst. The app holds no large data in memory (DB is remote). |
| Disk | 10 GB | **20–25 GB SSD** | App image + logs + OS. **No user data is stored on disk** (all in Supabase). Size mainly for OS, Docker images, and log rotation. |
| OS | Ubuntu 22.04 LTS | **Ubuntu 24.04 LTS** (or 22.04 LTS) | Institution-standard Linux LTS. Debian 12 also fine (matches `node:20-slim` base). |
| Swap | — | 1–2 GB | Safety against OOM during traffic spikes at lunch rush. |

Rationale: workload is **I/O-bound** (proxying to Supabase/Razorpay/SMTP), not CPU-bound. "Thousands of users" ≠ thousands of simultaneous requests — realistic concurrency is tens to low-hundreds at peak meal times. A single 2 vCPU / 2 GB VM comfortably handles this; scale vertically first, not horizontally (see A7).

---

## C. Inbound Ports (what the public/campus network may reach)

| Port | Protocol | Exposure | Purpose |
|---|---|---|---|
| **443** | HTTPS/TCP | **Public internet** | The ONLY required public inbound port. Serves the PWA, admin, API, and the Razorpay webhook. 🔴 |
| **80** | HTTP/TCP | Public internet (optional) | Only to **301-redirect to 443** and for Let's Encrypt HTTP-01 challenge. No app traffic served in cleartext. ⚪ |
| **7070** | HTTP/TCP | **127.0.0.1 ONLY — never public** | The Node app's internal port. Must sit **behind the reverse proxy**, bound to loopback. 🔴 |
| 22 | SSH/TCP | Restricted to institution admin subnet / VPN | Server administration only — not public. 🟡 |

🔴 **Code-level caveat on binding port 7070:** the app currently calls `app.listen(PORT, ...)` with **no host argument** (`server.js:301`), so Node binds to **all interfaces (0.0.0.0)**, not loopback. Two acceptable fixes:
- **Preferred (no code change):** run in Docker and publish the port to loopback only — `-p 127.0.0.1:7070:7070` — and let the OS firewall (ufw/iptables) DROP inbound 7070 from everywhere except localhost.
- **Code change:** bind explicitly — `app.listen(PORT, '127.0.0.1', ...)`. Do NOT leave 7070 reachable on the server's public IP.

```bash
# Verify after deploy — 7070 must ONLY answer on localhost:
curl -s http://127.0.0.1:7070/api/health   # -> 200 OK
curl -s http://<SERVER_PUBLIC_IP>:7070/api/health   # -> MUST time out / refuse
```

**UFW baseline:**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp          # optional, redirect + ACME only
sudo ufw allow from <ADMIN_SUBNET> to any port 22 proto tcp
sudo ufw enable
```

---

## D. Outbound Firewall Allowlist 🔴 (IT WILL ask this exactly)

**If ANY of these outbound destinations is blocked, the corresponding feature fails — and several mean the app cannot function at all.** The institution's egress firewall must allow the server to reach:

| Destination Host | Port | Protocol | Purpose | If BLOCKED → consequence |
|---|---|---|---|---|
| `mnvxojjbbiqmymlatigh.supabase.co` | **443** | TLS/HTTPS | Main database (Postgres via Supabase REST/RPC), Row-Level Security, admin auth (Supabase Auth JWT), all money-moving RPCs | 🔴 **Total outage.** No orders, no menu, no login, no wallet, no admin. App is dead. |
| `massive-panda-19626.upstash.io` | **6379** | **TLS (rediss://)** | OTP storage + auth rate limiting (Upstash Redis) | 🔴 **Students cannot log in** (OTP can't be stored/verified). Falls back to in-memory only if configured; treat as hard dependency. |
| `api.razorpay.com` | **443** | TLS/HTTPS | LIVE payment order creation + server-side payment verification/capture | 🔴 **No payments.** Checkout breaks; wallet top-ups fail. |
| `smtp.gmail.com` | **587** | SMTP+STARTTLS | Email OTP delivery + order notifications (nodemailer) | 🔴 **No one can log in** (OTP email never arrives). Also no email receipts. |
| DNS resolver | **53** | UDP/TCP | Resolve all of the above hostnames | 🔴 Everything above fails to resolve → total outage. Allow the institution's DNS, or 8.8.8.8 / 1.1.1.1. |
| NTP (e.g. `pool.ntp.org` / institution NTP) | **123** | UDP | Clock sync | 🟡 Clock drift breaks **TLS handshakes** and **Razorpay HMAC/timing-safe signature** verification (`webhook`). Keep time synced. |
| (transitive) Razorpay checkout CDN | 443 | HTTPS | Loaded **in the student's browser**, not the server — but note it for any campus client-side egress filtering | 🟡 If campus WiFi blocks Razorpay's JS, students on campus can't complete payment. |

Notes for IT:
- These are **cloud SaaS** endpoints — no on-prem alternative. The server is a client to all of them.
- Upstash on **6379/tcp with TLS** is unusual (not 443) — call this out explicitly so it isn't dropped by a "web-only egress" policy. 🔴
- Prefer **hostname/FQDN allowlisting**; these vendors rotate IPs, so pinning IPs will break. If IT insists on IP allowlisting, they must track vendor IP ranges and expect churn.

**Secrets that must be present on the server (env vars, from `backend/.env`):**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_EMAIL`, `SMTP_PASSWORD`, `REDIS_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `PORT`, `NODE_ENV=production`, `FRONTEND_URL`.

⚠️ **Deploy-script gotcha (`deploy.ps1:54`):** the existing Cloud Run script only forwards a **hardcoded whitelist** of env vars. On the new server, provision **all** of the above manually — don't assume the old deploy tooling carries them. Notably `RAZORPAY_WEBHOOK_SECRET` is derived in the script from `RAZORPAY_SECRET` (`deploy.ps1:60-63`); on the new server set it explicitly. 🔴

**Egress verification (run on the server after firewall rules are applied):**
```bash
for hp in mnvxojjbbiqmymlatigh.supabase.co:443 \
          massive-panda-19626.upstash.io:6379 \
          api.razorpay.com:443 \
          smtp.gmail.com:587; do
  h=${hp%:*}; p=${hp#*:}
  timeout 5 bash -c "</dev/tcp/$h/$p" && echo "OK  $hp" || echo "BLOCKED  $hp"
done
```

---

## E. Inbound Webhook (public reachability requirement) 🔴

| Q | A |
|---|---|
| Is any inbound path required beyond serving users? | **Yes.** Razorpay's servers make **server-to-server POST** calls to `https://<domain>/api/payment/webhook` (`server.js:129`). |
| Must it be reachable from the public internet? | **Yes — not just campus LAN.** Razorpay calls from its own cloud IPs, outside TCET's network. If the domain is only resolvable/reachable on campus, webhooks silently fail. 🔴 |
| Port / protocol? | **443 HTTPS** (public), same as the main site. No separate port. |
| Auth on this endpoint? | HMAC signature verified server-side with `RAZORPAY_WEBHOOK_SECRET`, timing-safe compare. **Do not** put IP-allowlisting that blocks Razorpay, and **do not** require a login/VPN in front of `/api/payment/webhook`. |
| Reverse-proxy caveat | This route needs the **raw request body** for HMAC (`server.js:123-129` preserves it). Ensure the proxy does not rewrite/re-encode the body; pass it through untouched. 🟡 |

**Post-launch smoke test:** fire a Razorpay test webhook from the dashboard and confirm a 200 in the server logs; a live test payment should reconcile the order.

---

## F. Domain, DNS & TLS

| Q | A |
|---|---|
| Domains/subdomains? | `spoon.tcetswb.org` (student app + API + webhook) and `admin.spoon.tcetswb.org` (admin dashboard). Both terminate at the **same** Node process. |
| Record type? | `A` (+ `AAAA` if IPv6) pointing to the server's public static IP, **or** `CNAME` if fronted by a load balancer/managed host. Both hostnames → same origin. 🔴 |
| Who manages DNS for `tcetswb.org`? | **Institution IT** (owner of the `tcetswb.org` zone). Founder cannot self-serve; IT must create/point the two records. Confirm owner + TTL (use low TTL 300s during cutover). 🔴 |
| Who issues the TLS cert? | **Recommended: Let's Encrypt** via Certbot/Caddy on the reverse proxy (free, auto-renew). Alternative: **institution CA/wildcard cert** for `*.tcetswb.org` if IT policy requires. Decide who owns renewal. 🔴 |
| Cert coverage | Must cover **both** `spoon.` and `admin.` (SAN cert or two certs, or a `*.tcetswb.org` wildcard). |
| HTTPS enforcement | Redirect 80→443; enable HSTS at the proxy. Helmet is on, but **CSP is disabled** in-app — the proxy/security team should be aware. 🟡 |
| CORS | App already whitelists `https://spoon.tcetswb.org`, `https://admin.spoon.tcetswb.org`, and `FRONTEND_URL` (`server.js:106-111`). If IT uses a different hostname, set `FRONTEND_URL` accordingly or CORS will reject it. 🟡 |

---

## G. IP, Bandwidth, Storage, Data-Residency, Ops Ownership

| Q | A | Urgency |
|---|---|---|
| Public/static IP needed? | **Yes — one static public IPv4** for the two DNS records and for inbound Razorpay webhooks. Dynamic IP will break DNS/webhooks. | 🔴 |
| Bandwidth estimate | Low-to-moderate. PWA assets are small and **cached by the service worker** (`sw.js`) + browser after first load. API responses are small JSON. Rough peak: a few thousand users × a few hundred KB first-load, concentrated at meal times. A standard **100 Mbps** campus uplink is ample; no CDN strictly required. | ⚪ |
| Storage on institution server | **~20–25 GB total**, almost all OS/app/logs. **No student data or images stored locally.** | — |
| **Data-at-rest location** | 🚩 **Student/user data (accounts, orders, wallet balances, sessions) lives in Supabase cloud (`mnvxojjbbiqmymlatigh.supabase.co`), NOT on the institution server.** OTPs live in Upstash Redis cloud. The institution server is **stateless compute**. IT/compliance must know student PII resides with **third-party cloud processors (Supabase, Upstash), region likely `asia-south1`/AWS-ap-south** — verify the Supabase project region and get a data-processing agreement. | 🔴 |
| Backup ownership | **Database backups = Supabase's responsibility** (Supabase provides automated PITR/backups per plan tier — confirm the plan includes it). The institution server holds no data to back up beyond config/secrets. **Someone must own verifying Supabase backups exist and are restorable.** Back up `backend/.env` securely offline. | 🔴 |
| Patching owner | **OS + Docker/Node runtime patching = institution IT.** **App dependency patching (npm) = founder/dev.** Agree on who runs `apt upgrade`, kernel patches, and image rebuilds. `node:20-slim` base must be rebuilt periodically for CVEs. | 🟡 |
| Uptime / SLA expectation | Set expectations: this is a **single-instance** app (A7) — a VM reboot = brief downtime. For meal-time criticality, agree an SLA (e.g. 99% business hours) and a restart policy (systemd `Restart=always` / Docker `--restart unless-stopped`). External SaaS (Supabase/Razorpay/Upstash) have their own SLAs the app inherits. | 🟡 |
| Maintenance window | Define a low-traffic window (e.g. late night, **outside 11:00–15:00 meal hours**) for deploys/patching. | ⚪ |
| Log ownership / retention | App logs to stdout (`console.log` in `server.js`). Configure journald/Docker log rotation + retention per institution policy. Ensure **no secrets/PII** land in logs before enabling verbose logging. | 🟡 |

---

## H. Launch-Blocker Checklist (do before tomorrow) 🔴

- [ ] Static public IPv4 assigned; `spoon.` and `admin.tcetswb.org` A/AAAA (or CNAME) records created by IT.
- [ ] TLS cert issued for both hostnames (Let's Encrypt or institution CA); auto-renew configured.
- [ ] Outbound firewall allows all 4 SaaS endpoints + DNS(53) + NTP(123) — verified with the egress test script (§D).
- [ ] `/api/payment/webhook` reachable from **public internet** over 443; Razorpay test webhook returns 200.
- [ ] Port 7070 bound to **127.0.0.1 only**; verified NOT reachable on the public IP (§C).
- [ ] Container/process runs as **non-root** (fix `Dockerfile` USER or run `--user`).
- [ ] All ~15 env vars set on the new server (incl. explicit `RAZORPAY_WEBHOOK_SECRET`, `NODE_ENV=production`, `FRONTEND_URL`); `backend/.env` NOT in any shared repo.
- [ ] Running via production method (Docker with prod flags or systemd) — **NOT** the dev `docker-compose.yml`.
- [ ] Reverse proxy passes the raw body to the webhook route unmodified.
- [ ] NTP/clock sync confirmed (protects TLS + HMAC).
- [ ] Confirmed Supabase project region + that automated DB backups are enabled and restorable.

## H2. Important / nice-to-have

- [ ] 🟡 Pin Node 20.x (`engines` in `package.json`) so out-of-Docker runs are consistent.
- [ ] 🟡 Add a `HEALTHCHECK` (or orchestrator liveness probe) hitting `/api/health`.
- [ ] 🟡 Log rotation + retention configured; verify no PII/secrets in logs.
- [ ] 🟡 HSTS + 80→443 redirect at proxy; review disabled CSP with security team.
- [ ] 🟡 Single instance only for launch (in-memory OTP fallback is not multi-instance safe).
- [ ] ⚪ Decide/agree maintenance window outside meal hours; document rollback (redeploy prior image).

---

## I. Reference Configs (hand to IT)

**Nginx reverse proxy (both hostnames → local 7070, webhook body untouched):**
```nginx
server {
    listen 443 ssl http2;
    server_name spoon.tcetswb.org admin.spoon.tcetswb.org;

    ssl_certificate     /etc/letsencrypt/live/spoon.tcetswb.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/spoon.tcetswb.org/privkey.pem;

    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:7070;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # app has trust proxy = 1
        proxy_request_buffering on;                   # deliver raw body to webhook
    }
}
server {
    listen 80;
    server_name spoon.tcetswb.org admin.spoon.tcetswb.org;
    return 301 https://$host$request_uri;
}
```
> Note: the app sets `app.set('trust proxy', 1)` (`server.js:65`) — exactly one proxy hop. Keep Nginx as the single hop or per-IP rate limits (payment 50/15min, api 300/min) will misattribute clients.

**Production Docker run (loopback-bound, non-root, auto-restart):**
```bash
docker build -t spoon:prod .
docker run -d --name spoon \
  --user 1000:1000 \
  --restart unless-stopped \
  --env-file /etc/spoon/spoon.env \
  -e NODE_ENV=production \
  -p 127.0.0.1:7070:7070 \
  spoon:prod
```

**systemd unit (bare-Node alternative):**
```ini
[Unit]
Description=Spoon backend
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/spoon
EnvironmentFile=/etc/spoon/spoon.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=3
User=spoon
Group=spoon
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/spoon
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```


---

## B. Environment Variables / API Keys Inventory

# Environment Variables / API Keys Inventory

*Verified against the live repo: `backend/.env.example`, `deploy.ps1`, `backend/routes/config.js`, `backend/routes/payment.js`, `backend/routes/push.js`, `backend/services/paymentFlowValidator.js`, `backend/services/webPushService.js`, `backend/server.js`, and `.gitignore`. Nothing below is invented — every var is tied to a real `process.env.*` read.*

Spoon reads **16 required** env vars + **4 optional** WhatsApp vars via `dotenv` from `backend/.env`. There is no `engines` pin and no secrets-manager integration in code — the process trusts whatever is in its environment. On the institution server, getting this table right *is* the launch.

## 1. Master inventory

Legend for **Provided by**: **YOU** = student founder already holds it · **VENDOR** = generate/copy from a SaaS console · **INSTITUTION** = the college IT team decides/sets it on their server.

| # | Variable | What it is | Where to obtain it | Provided by | Sensitivity | Rotation |
|---|----------|-----------|--------------------|-------------|-------------|----------|
| 1 | `SUPABASE_URL` | Base URL of the Supabase project (`https://mnvxojjbbiqmymlatigh.supabase.co`). Used by every DB client + shipped to the browser via `/api/config`. | Supabase Dashboard → Settings → API → *Project URL* | YOU (VENDOR) | 🟢 **PUBLIC-ok** (already exposed to browsers) | Effectively never (fixed per project). |
| 2 | `SUPABASE_ANON_KEY` | Public/anon JWT for RLS-scoped client access. Served to the browser by `config.js:25`. | Supabase Dashboard → Settings → API → *anon / public* key | YOU (VENDOR) | 🟢 **PUBLIC-ok** — safe in browser *only because RLS is enforced*. | Rotate via Supabase "Reset JWT secret" (invalidates anon **and** service_role together). Rare. |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | 🔴 **God-mode DB key. BYPASSES ROW-LEVEL SECURITY.** Used server-side in ~10 files (wallet, orders, push, admin, health…). | Supabase Dashboard → Settings → API → *service_role* key | YOU (VENDOR) | 🔴 **CATASTROPHIC SECRET.** Full read/write of every user, wallet balance, order. Never in browser/git/image. | Immediately on any leak, via Supabase "Reset JWT secret". Then redeploy. |
| 4 | `RAZORPAY_KEY_ID` | LIVE public key id (`rzp_live_…`). Sent to browser via `config.js:26` to open Checkout; also HTTP-basic username for server→Razorpay calls (`payment.js:98,177`). | Razorpay Dashboard → Settings → API Keys | YOU (VENDOR) | 🟢 **PUBLIC-ok** (designed to be in the checkout script). | Regenerate in dashboard; old key stays valid until you deactivate it. |
| 5 | `RAZORPAY_SECRET` | 🔴 LIVE API secret. HTTP-basic password for order-create + payment-fetch, **and** the HMAC key for `verify-payment` signature (`payment.js:99,155,178`). | Razorpay Dashboard → Settings → API Keys (shown **once** at generation) | YOU (VENDOR) | 🔴 **CATASTROPHIC SECRET.** Can move real money / issue refunds. | Regenerate + swap immediately on leak. |
| 6 | `RAZORPAY_WEBHOOK_SECRET` | 🔴 Signing secret for inbound `POST /api/payment/webhook`; HMAC-verified in `paymentFlowValidator.js:182`. **Separate value from #5** — you type it yourself when creating the webhook. | Razorpay Dashboard → Settings → Webhooks → (the secret you set when adding the endpoint) | YOU (VENDOR) | 🔴 **SECRET.** Leak lets an attacker forge "payment captured" events → free orders / fake wallet credit. | Edit the webhook in the dashboard, set a new secret, update env, redeploy. |
| 7 | `SMTP_EMAIL` | Gmail address that sends OTP + order emails (`emailService.js:16`). | The Gmail account you own | YOU | 🟡 Low-sensitivity (it's a visible From: address) but keep off git. | On mailbox change. |
| 8 | `SMTP_PASSWORD` | 🔴 Gmail **App Password** (16 chars, not the account password). `emailService.js:17`. | myaccount.google.com/apppasswords (needs 2FA on) | YOU (VENDOR) | 🔴 **SECRET.** Grants send-as of the account → OTP hijack / phishing from your domain. | Revoke + recreate the App Password at the same URL. |
| 9 | `REDIS_URL` | Full Upstash TLS URL incl. password: `rediss://massive-panda-19626.upstash.io:6379`. OTP store + rate limiting (`redisClient.js:14`). | Upstash Console → your DB → *Connect* (rediss:// with token) | YOU (VENDOR) | 🔴 **SECRET** — the password is embedded in the URL. Leak = read OTPs / wipe rate-limit state. | Rotate the token in Upstash Console; URL string changes. |
| 10 | `VAPID_PUBLIC_KEY` | Web-push public key. Sent to browsers to register push subscriptions (`push.js:138`, `webPushService.js:15`). | Generated once: `npx web-push generate-vapid-keys` | YOU | 🟢 **PUBLIC-ok** (by design in the browser). | ⚠️ Generate **once, reuse forever**. Rotating invalidates every existing push subscription. |
| 11 | `VAPID_PRIVATE_KEY` | 🔴 Signs push messages (`webPushService.js:16`). | Same `web-push generate-vapid-keys` run (the private half) | YOU | 🔴 **SECRET.** Leak lets attacker push notifications as Spoon. | Only on compromise — and doing so forces all users to re-subscribe. |
| 12 | `VAPID_EMAIL` | `mailto:` contact for push (VAPID `sub`). `push.js:10`. Format `mailto:you@…`. | You choose | YOU | 🟢 PUBLIC-ok. | Rarely. |
| 13 | `PORT` | TCP port Express binds (`server.js:89`, default `7070`). | You / the server platform | INSTITUTION | 🟢 Non-secret config. | N/A. |
| 14 | `NODE_ENV` | 🔴 **Security-critical flag.** Must equal `production`. `server.js:107` — if it isn't, CORS falls back to `origin:true` = **allow ALL origins** (`server.js:113`). Also gates `verify-payment` logging (`payment.js:24`). | Set by you on the server | INSTITUTION | 🟢 Non-secret, but 🔴 wrong value = open CORS. | N/A — set once, correctly. |
| 15 | `FRONTEND_URL` | Optional 3rd CORS origin, added to the whitelist `[spoon.tcetswb.org, admin.spoon.tcetswb.org, FRONTEND_URL]` (`server.js:111`). Filtered out if empty. | You choose | INSTITUTION | 🟢 Non-secret. | On domain change. |
| 16 | `SUPABASE_SERVICE_ROLE_KEY` covered above — no extra. | | | | | |

**Optional (WhatsApp / OpenWA — stays OFF in prod unless explicitly enabled):**

| # | Variable | What it is | Provided by | Sensitivity |
|---|----------|-----------|-------------|-------------|
| O1 | `WHATSAPP_ENABLED` | `'true'` to enable order-ready WhatsApp; anything else = feature skipped (`whatsappService.js:8`). | INSTITUTION | 🟢 config |
| O2 | `OPENWA_API_URL` | OpenWA/WAHA HTTP API base (must NOT be `localhost` in prod). `whatsappService.js:9` | INSTITUTION | 🟢 config |
| O3 | `OPENWA_API_KEY` | Auth token for that OpenWA server. `whatsappService.js:10` | INSTITUTION | 🔴 SECRET if set |
| O4 | `OPENWA_SESSION_NAME` | OpenWA session id, e.g. `spoon-notifications`. `whatsappService.js:11` | INSTITUTION | 🟢 config |

## 2. Sensitivity — the two lists that matter

**🟢 SAFE to appear in the browser / `/api/config` response** (verified: `config.js` returns exactly these three + a blank `API_BASE_URL`):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (safe **only** because RLS is on), `RAZORPAY_KEY_ID`, and `VAPID_PUBLIC_KEY` (served via the push route). These are *designed* to be public.

**🔴 CATASTROPHIC if leaked — MUST never be in the browser, in git, or in a Docker image layer:**
| Secret | What one leak buys an attacker |
|--------|-------------------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | **Total DB control** — reads/writes every user, wallet balance, order; bypasses all RLS. The single worst key to lose. |
| `RAZORPAY_SECRET` | Move/refund real LIVE money; forge `verify-payment` signatures. |
| `RAZORPAY_WEBHOOK_SECRET` | Forge "payment captured" webhooks → free food / phantom wallet credit. |
| `SMTP_PASSWORD` | Send OTP/phishing mail *as your Gmail*. |
| `REDIS_URL` | Password is in the string → read live OTPs, flush rate limits. |
| `VAPID_PRIVATE_KEY` | Push spam/phishing notifications as Spoon. |

> **Docker note:** the current Dockerfile runs `npm install --only=production` and `CMD node backend/server.js` — it does **not** copy `.env`, which is correct. Never add `COPY backend/.env` or `ENV RAZORPAY_SECRET=…` — every `ENV`/`COPY` becomes a permanent, inspectable image layer (`docker history`). Inject secrets **at runtime only**.

## 3. Repo hygiene — verified

- [x] `.env` and `backend/.env` are **gitignored** (`.gitignore` lines 17–18, plus `*.env.*.local`). ✅ Confirmed — no secrets in the repo.
- [ ] 🟡 **`backend/.env.example` is INCOMPLETE.** It is missing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, and `FRONTEND_URL`. Anyone provisioning a fresh server from the template alone will ship with **push notifications dead** and a **missing CORS origin**. Add these four to `.env.example` before handoff.
- [ ] ⚪ `payment.js:155` reads `process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET` — an undocumented alias. You only need to set `RAZORPAY_SECRET`; ignore `RAZORPAY_KEY_SECRET`.

## 4. 🔴 Migration hazards baked into `deploy.ps1` (Cloud Run) — do NOT carry these to the institution server

`deploy.ps1` is Cloud-Run-specific and will **not** run on the institution box, but its logic encodes two traps you must consciously avoid when re-provisioning env vars:

1. 🔴 **Webhook secret is DERIVED, not real.** `deploy.ps1:60-63` sets `RAZORPAY_WEBHOOK_SECRET = <value of RAZORPAY_SECRET>`. That is only correct if the founder happened to type the API secret as the webhook signing secret in the Razorpay dashboard. On the new server, set `RAZORPAY_WEBHOOK_SECRET` to the **actual** value from Razorpay → Webhooks. If it's wrong, `paymentFlowValidator.js:182` rejects every real webhook → orders may not confirm via the webhook path.
2. 🔴 **`NODE_ENV` must be explicitly `production`.** Cloud Run got it hardcoded (`deploy.ps1:36`). A bare `systemd`/`docker run` will **not** — and if `NODE_ENV !== 'production'`, `server.js:113` opens CORS to **every origin**. Set it explicitly.
3. 🟡 **`FRONTEND_URL` was never forwarded** by `deploy.ps1` (not in its whitelist). Fine if you only use the two hardcoded domains; set it if the app is served from any other origin.
4. 🟡 **`PORT`** wasn't forwarded (Cloud Run injects it). On the institution server, either set `PORT` or accept the `7070` default and point the reverse proxy at it.

## 5. 🔴 Secure storage on the institution-managed server

**Do NOT:** commit `backend/.env`, bake secrets via Dockerfile `ENV`/`COPY`, or paste them into a shared doc/Slack. Pick **one** injection method:

**Option A — systemd `EnvironmentFile` (recommended for a plain VM). 🔴**
```bash
# One-time, as root on the institution server:
sudo install -d -m 700 -o root -g root /etc/spoon
sudo install -m 600 -o root -g root /dev/null /etc/spoon/spoon.env
sudo nano /etc/spoon/spoon.env      # paste KEY=VALUE lines (no quotes, no 'export')

# Verify it is locked down (must read: -rw------- root root):
ls -l /etc/spoon/spoon.env
```
```ini
# /etc/systemd/system/spoon.service
[Unit]
Description=Spoon backend
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/spoon/spoon.env
WorkingDirectory=/opt/spoon
ExecStart=/usr/bin/node backend/server.js
Restart=on-failure
# Harden: run as a non-root service account, NOT root (the Docker image runs as root today)
User=spoon
Group=spoon
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now spoon
```

**Option B — Docker Compose with off-repo `env_file`. 🔴**
```yaml
# docker-compose.prod.yml  (do NOT reuse the dev compose: NODE_ENV=development + bind-mount .:/app)
services:
  spoon:
    image: spoon-backend:latest
    env_file: /etc/spoon/spoon.env      # 600, root-owned, OUTSIDE the build context
    environment:
      NODE_ENV: production               # force it explicitly
    ports: ["127.0.0.1:7070:7070"]       # bind to loopback; TLS terminates at the institution proxy
    restart: unless-stopped
```
Ensure `/etc/spoon/` is **not** in the build context (or is `.dockerignore`d) so it never lands in an image layer.

**Option C — a secrets manager (best long-term). ⚪** Google Secret Manager / HashiCorp Vault / Doppler; fetch at boot into the process env. More moving parts than you need for a tomorrow launch — do A or B now, migrate to C later.

## 6. Launch checklist (env-vars dimension)

- [ ] 🔴 Populate all **16 required** vars on the institution server via Option A or B — nothing hardcoded in image/git.
- [ ] 🔴 Set `RAZORPAY_KEY_ID` / `RAZORPAY_SECRET` to **LIVE** (`rzp_live_…`) values, not test.
- [ ] 🔴 Set `RAZORPAY_WEBHOOK_SECRET` to the **real** value from Razorpay → Webhooks (NOT a copy of the API secret), and confirm the webhook endpoint points at `https://spoon.tcetswb.org/api/payment/webhook`.
- [ ] 🔴 Set `NODE_ENV=production` explicitly — verify open CORS is closed (`curl -I -H "Origin: https://evil.com" https://spoon.tcetswb.org/api/config` must **not** echo that origin).
- [ ] 🔴 Confirm the env file is `chmod 600`, root-owned, and outside the repo/Docker build context.
- [ ] 🔴 Run the app as a **non-root** user (current Docker image runs as root).
- [ ] 🟡 Add the missing `VAPID_*` + `FRONTEND_URL` to `backend/.env.example` and to the real env file (generate VAPID once: `npx web-push generate-vapid-keys`).
- [ ] 🟡 Verify egress from the institution server to all five SaaS hosts: `mnvxojjbbiqmymlatigh.supabase.co:443`, `massive-panda-19626.upstash.io:6379 (TLS)`, `api.razorpay.com:443`, `smtp.gmail.com:587`, and **inbound** 443 for the Razorpay webhook.
- [ ] 🟡 Smoke-test `/api/health` and confirm it reports Supabase/Redis reachable before opening to students.
- [ ] ⚪ Store the founder's copy of all six 🔴 secrets in a password manager (1Password/Bitwarden vault), not a text file — this is the "hand to himself" backup.

### Rotation cheat-sheet (post-launch hygiene)
| Key | How to rotate | Side effect |
|-----|---------------|-------------|
| Supabase anon/service_role | Dashboard → "Reset JWT secret" | Rotates **both** at once; redeploy immediately. |
| Razorpay key id/secret | Dashboard → generate new, deactivate old | Old key valid until deactivated → zero-downtime swap. |
| Razorpay webhook secret | Dashboard → Webhooks → edit secret | Update env + redeploy in the same window. |
| SMTP app password | myaccount.google.com/apppasswords → revoke + recreate | Old password dies instantly. |
| `REDIS_URL` token | Upstash Console → rotate | URL string changes; update env. |
| VAPID keypair | `npx web-push generate-vapid-keys` | ⚠️ Invalidates **all** existing push subscriptions — treat as generate-once, rotate only on compromise. |


---

## C. Deployment Architecture & Runbook (institution server)

I have everything verified against the real code. Here is the runbook section.

---

# Deployment Architecture & Runbook — Institution Server

*Scope: how to run Spoon (`node backend/server.js`) on a college-managed Linux box for an institution-wide launch. Every claim below is tied to a real file/line in the repo.*

## 0. Architecture in one paragraph (read this first)

Spoon is **one single Node process** that does two jobs at once: it serves the JSON API under `/api/*` **and** serves the entire vanilla-JS PWA + admin dashboard as static files. This is not two servers. In `backend/server.js:254-257` the app does `express.static(path.join(__dirname,"../"))` — it serves the **whole repo root** — and `app.get("/")` (`:263`) redirects to `/public/index.html`. `app.listen(PORT)` (`:301`, default `7070`) binds `0.0.0.0`. **You do NOT need Apache/nginx to serve the frontend** — nginx's only job here is TLS termination + reverse proxy. The app reaches out to 4 external SaaS systems (Supabase, Upstash Redis, Razorpay, Gmail SMTP) and *receives* inbound webhooks from Razorpay. There is no local database, no local Redis, no disk state — so the server is stateless and trivially restartable.

```
Internet ──443──> nginx (TLS, HSTS, gzip) ──127.0.0.1:7070──> node backend/server.js ──┐
   ▲                                                                                    ├─► Supabase :443
   └── Razorpay webhook POST /api/payment/webhook                                       ├─► Upstash Redis :6379 (TLS)
                                                                                        ├─► api.razorpay.com :443
                                                                                        ├─► smtp.gmail.com :587
                                                                                        └─► web-push (FCM/Mozilla/Apple/WNS) :443
```

---

## 1. Pre-flight code/config fixes (do these BEFORE you deploy anything)

| # | Fix | Why | File / evidence | Urgency |
|---|-----|-----|-----------------|---------|
| 1 | Add `"engines": { "node": ">=20.0.0 <21.0.0" }` to `package.json` | No engine pin today (`package.json` has none). Institution box could ship Node 18/22 and silently break. | `package.json` | 🔴 |
| 2 | Change Dockerfile install to `npm ci --omit=dev --no-audit` | Current `npm install --only=production` (`Dockerfile:13`) uses a deprecated flag and ignores the lockfile → non-reproducible builds. A `package-lock.json` **exists**, so `npm ci` works. | `Dockerfile:13` | 🔴 |
| 3 | Set `NODE_ENV=production` in the runtime env | CORS is a wildcard (`origin: true`, reflects ANY origin) unless `NODE_ENV==='production'`; only then does the whitelist apply. | `server.js:107-113` | 🔴 |
| 4 | Keep the secrets file **outside the app directory** (e.g. `/etc/spoon/spoon.env`), never `backend/.env` on a bare-metal deploy | `express.static` serves the **whole repo root**. A `backend/.env` sitting in the served tree is downloadable at `https://spoon.tcetswb.org/backend/.env`. | `server.js:254-257` | 🔴 |
| 5 | Add `USER node` to the Dockerfile (image ships a uid-1000 `node` user) | Container currently runs as **root**. | `Dockerfile` (no `USER`) | 🟡 |
| 6 | Pin the base image to a digest or at least `node:20.x-slim` | Reproducible rebuilds for rollback. | `Dockerfile:3` | 🟡 |

### 1a. 🔴 Two rate-limit landmines that specifically detonate on an institution network

These are **not** in the runbook by accident — they are the difference between "launch works" and "everyone is logged out at 9am." Both are caused by `express-rate-limit` keying on **client IP** (`req.ip`), combined with `app.set('trust proxy', 1)` (`server.js:65`).

**(A) The heartbeat × campus-NAT problem.** The PWA pings `POST /api/auth/validate-session` **every 15 seconds** to enforce one-device login (`js/core/session-guard.js`, `backend/routes/auth.js`). That is **4 requests/min per logged-in user**. The general limiter is **300 req/min per IP** (`server.js:154-167`). If students on campus Wi-Fi egress through one NAT public IP, they all share **one 300/min bucket**:

> 300 ÷ 4 ≈ **75 concurrent users per shared public IP** before the heartbeat alone trips `429` for the *entire campus* → mass forced-logout.

**(B) The webhook × payment-limiter problem.** `paymentLimiter` = **50 req / 15 min per IP** and is mounted on the whole `/api/payment` prefix (`server.js:142-166`), which **includes `/api/payment/webhook`**. Razorpay delivers webhooks from a *small* set of source IPs. During a lunch rush of hundreds of orders, that one Razorpay IP exceeds 50/15min → Razorpay gets `429` → **missed payment confirmations**.

**What to do before launch (pick per your network reality — confirm topology with IT):**

- [ ] 🔴 Ask IT: *do student devices reach this server with distinct per-device IPs (internal RFC1918) or one shared NAT public IP?* If distinct-per-device, (A) is far less severe but still verify.
- [ ] 🔴 Exempt the webhook from the payment limiter, e.g. `paymentLimiter` with `skip: (req) => req.path === '/webhook'` (or mount the webhook route *before* the limiter). Non-negotiable at institution order volume.
- [ ] 🔴 Either raise the general limiter substantially, key it by authenticated identity (`x-user-email`) instead of IP, or add `skip` for `/api/auth/validate-session`. Any one of these prevents the campus-NAT lockout.
- [ ] 🟡 If you ever run **more than one Node process** (PM2 cluster / multiple replicas), note the limiter uses the **in-memory store** (no Redis store configured) → each process has its own buckets → limits become inconsistent. OTP is unaffected (it lives in Upstash Redis). This is a reason to **run a single process** for launch (see recommendation).

---

## OPTION A — Docker Compose (production)

The committed `docker-compose.yml` is **DEV-only and unsafe for prod**: `NODE_ENV=development` (→ CORS wildcard), bind-mount `.:/app` (→ ships your laptop's files/secrets into the container), publishes `7070` on all interfaces, `restart: always`, no healthcheck, no limits, root user.

### A1. Corrected production Dockerfile

```dockerfile
# Dockerfile (production)
FROM node:20-slim

WORKDIR /app

# Install prod deps reproducibly from the lockfile
COPY package*.json ./
RUN npm ci --omit=dev --no-audit

# App source (node_modules, .env, tests, *.md are excluded by .dockerignore)
COPY . .

ENV NODE_ENV=production \
    PORT=7070

EXPOSE 7070
USER node

# node:20-slim has NO curl/wget — use Node's own http client
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:7070/api/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/server.js"]
```

> Timeout is **6s** on purpose: `checkRedis()` sleeps up to **3s** waiting for a fresh Redis connection (`routes/health.js:34-37`), so a 1-2s timeout would false-fail. `/api/health` returns **200** for `healthy`/`degraded` and **503** only when Redis is down (`routes/health.js:103-159`), so `<500 = pass` is the right predicate.

### A2. `docker-compose.prod.yml`

```yaml
services:
  backend:
    build: .
    image: spoon:latest                 # tag your builds; keep the previous tag for rollback
    restart: unless-stopped             # NOT "always" — respects an intentional `docker compose stop`
    env_file:
      - /etc/spoon/spoon.env            # OFF-REPO secrets; never committed, never in the served tree
    environment:
      - NODE_ENV=production             # belt-and-suspenders: force prod even if env_file forgets it
      - PORT=7070
    ports:
      - "127.0.0.1:7070:7070"           # loopback only — public traffic must come via nginx
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:7070/api/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 6s
      start_period: 30s
      retries: 3
    deploy:
      resources:
        limits:   { cpus: "1.0", memory: 768M }
        reservations: { cpus: "0.5", memory: 256M }
    # Hardening: the app writes nothing to disk (logs go to stdout)
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }   # cap disk so logs can't fill the box
```

Deploy / operate:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps          # STATUS should show (healthy)
docker compose -f docker-compose.prod.yml logs -f      # app logs (console.log/console.error → stdout/stderr)
```

**Option A pros:** identical build everywhere, hardening (read-only FS, non-root, caps dropped) is one file, healthcheck baked in, log rotation via json-file driver. **Cons:** requires Docker installed & permitted on the institution box; a single-container restart is a ~1-2s blip (mitigated by deploying off-peak); `deploy.resources` limits only apply under `docker compose` (fine here) not raw Swarm-less edge cases.

---

## OPTION B — Bare Node 20 + systemd + nginx

No Docker. Clone the repo to `/opt/spoon`, install prod deps, run under systemd, front it with nginx.

### B1. One-time setup

```bash
sudo useradd --system --home /opt/spoon --shell /usr/sbin/nologin spoon
sudo git clone https://github.com/imarjunyadav/spoon.git /opt/spoon
cd /opt/spoon
sudo -u spoon npm ci --omit=dev            # uses package-lock.json
sudo mkdir -p /etc/spoon
sudo install -m 600 -o spoon -g spoon /dev/null /etc/spoon/spoon.env   # then populate (see §3)
```

> 🔴 The secrets file lives at **`/etc/spoon/spoon.env`**, **not** `/opt/spoon/backend/.env`. Because `express.static` serves `/opt/spoon` (repo root), any `.env` under it becomes web-downloadable.

### B2. systemd unit — `/etc/systemd/system/spoon.service`

```ini
[Unit]
Description=Spoon backend (Express API + static PWA)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=spoon
Group=spoon
WorkingDirectory=/opt/spoon
EnvironmentFile=/etc/spoon/spoon.env
Environment=NODE_ENV=production
Environment=PORT=7070
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=3
# Logs go to journald (console.log/console.error → stdout/stderr)
StandardOutput=journal
StandardError=journal
SyslogIdentifier=spoon

# Hardening (app writes nothing to disk)
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadOnlyPaths=/opt/spoon
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spoon
systemctl status spoon
journalctl -u spoon -f            # live logs
```

### B3. nginx reverse proxy — `/etc/nginx/sites-available/spoon.conf`

Serves **both** domains (app + admin) → same backend; the admin dashboard is just static files from the same Express server.

```nginx
# ---- 80 -> 443 redirect (both hosts) ----
server {
    listen 80;
    listen [::]:80;
    server_name spoon.tcetswb.org admin.spoon.tcetswb.org;
    return 301 https://$host$request_uri;
}

# ---- 443 TLS terminator + reverse proxy ----
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name spoon.tcetswb.org admin.spoon.tcetswb.org;

    ssl_certificate     /etc/letsencrypt/live/spoon.tcetswb.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/spoon.tcetswb.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # HSTS (Helmet also sets it, but set at the edge too)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # express.json() default cap is 100kb; no large uploads exist. Keep it tight.
    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:7070;
        proxy_http_version 1.1;

        # REQUIRED because app.set('trust proxy', 1) (server.js:65) reads these.
        # $proxy_add_x_forwarded_for + trust proxy=1 => req.ip = real client IP.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_read_timeout 30s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/spoon.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d spoon.tcetswb.org -d admin.spoon.tcetswb.org   # or install institution CA certs
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ Trust-proxy correctness: exactly **one** proxy (nginx) sits in front and `trust proxy` is `1`. Do **not** add a second reverse proxy / load balancer without bumping the trust-proxy count, or `req.ip` (and therefore rate limiting) will key on the wrong hop.

**Option B pros:** no Docker dependency, `journalctl` logging the IT team already knows, cleanest zero-downtime story via a second replica (see §5). **Cons:** manual dependency/OS drift, hardening is more verbose, node version managed by the OS (pin with the `engines` field + `.nvmrc`).

---

## Recommendation

| Situation | Recommendation |
|-----------|----------------|
| Docker is available & allowed on the institution box | **OPTION A**, single container. Repeatable, hardened, self-healthchecking. |
| Docker not permitted / IT prefers native services | **OPTION B**, systemd + nginx, **single process**. |

Either way: **run ONE Node process for launch.** Spoon is I/O-bound — every unit of work is delegated to Supabase/Redis/Razorpay/SMTP — so a single Node event loop comfortably handles thousands of concurrent I/O connections. Going multi-process (PM2 cluster / replicas) *fragments the in-memory rate-limit store* (§1a-B) and buys little, because the bottleneck is the external SaaS, not local CPU. Scale **up** later only if CPU actually saturates. Note: moving off Cloud Run also **removes cold starts** — the current `deploy.ps1` runs `--min-instances 0` (`deploy.ps1:81`), so an always-on box is strictly faster for first-request latency.

---

## 2. `/api/health` — how monitoring should use it

| Property | Value | Source |
|---|---|---|
| Path | `GET /api/health` | `server.js:214` |
| Checks | Redis ping **and** Supabase `users` count query, in parallel | `routes/health.js:135-138` |
| `200` | `healthy` (both up) or `degraded` (Supabase down, Redis up) | `routes/health.js:103-116, 153-157` |
| `503` | `unhealthy` (Redis down — Redis is treated as critical for OTP) | `routes/health.js:108-110, 156` |
| Latency note | Up to ~3s on a cold Redis connection (deliberate wait) | `routes/health.js:34-37` |

- [ ] 🟡 Point an external uptime monitor (UptimeRobot/Better Uptime/institution NMS) at `https://spoon.tcetswb.org/api/health`, alert on `503` or timeout.
- [ ] ⚪ Treat `200 {status:"degraded"}` as a soft alert (Supabase reachable-but-not = orders won't persist even though OTP works).

---

## 3. Where each setting goes (env, CORS, webhook, VAPID)

Populate `/etc/spoon/spoon.env` (Option B) or the `env_file` (Option A) — same keys, read via `dotenv` from process env. Full list (`server.js`, `deploy.ps1:54`, route files):

```ini
NODE_ENV=production
PORT=7070
FRONTEND_URL=https://spoon.tcetswb.org

# Supabase (URL + anon are also served to the browser via /api/config)
SUPABASE_URL=https://mnvxojjbbiqmymlatigh.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # secret, server-only

# Razorpay LIVE
RAZORPAY_KEY_ID=...                    # public-ish, served via /api/config
RAZORPAY_SECRET=...                    # secret
RAZORPAY_WEBHOOK_SECRET=...            # the value from the Razorpay dashboard webhook, NOT the API secret

# Gmail SMTP
SMTP_EMAIL=...
SMTP_PASSWORD=...                      # Gmail App Password

# Upstash Redis
REDIS_URL=rediss://massive-panda-19626.upstash.io:6379

# Web Push (VAPID)
VAPID_PUBLIC_KEY=...                   # served to browser via /api/push/key
VAPID_PRIVATE_KEY=...                  # secret
VAPID_EMAIL=mailto:...

# WhatsApp stays OFF — leave WHATSAPP_ENABLED/OPENWA_* unset
```

- **FRONTEND_URL + CORS:** the whitelist is hardcoded `spoon.tcetswb.org`, `admin.spoon.tcetswb.org`, **plus** `FRONTEND_URL` (`server.js:107-113`) and only applies when `NODE_ENV=production`. Set `FRONTEND_URL=https://spoon.tcetswb.org`. Any additional origin (e.g. a staging host) must be added here or the browser will be blocked.
- 🔴 **`RAZORPAY_WEBHOOK_SECRET`:** the old `deploy.ps1` (`:60-63`) copied `RAZORPAY_SECRET` into `RAZORPAY_WEBHOOK_SECRET` — that only works if they happen to be equal. On the new server, set it to the **actual signing secret shown in Razorpay Dashboard → Webhooks**, or HMAC verification (timing-safe) will reject every webhook.
- **Razorpay webhook URL:** in the Razorpay dashboard, point the webhook to **`https://spoon.tcetswb.org/api/payment/webhook`** (must be publicly reachable on 443). Subscribe to the payment events the app expects (e.g. `payment.captured`). Re-check §1a-B (exempt this path from the limiter).
- **VAPID:** private key stays server-side; the public key is exposed to the browser at `GET /api/push/key` (`routes/push.js:137-143`). Reuse the **existing** VAPID keypair — rotating it invalidates every already-registered push subscription.
- **Client config:** the browser fetches `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RAZORPAY_KEY_ID` from `GET /api/config` (`routes/config.js:22-28`) with `API_BASE_URL: ''` (relative) — so **no rebuild needed** when the domain is the same; nothing is hardcoded to Cloud Run.

---

## 4. Network / firewall asks for the IT department

**Inbound (open to the world, or at least to Razorpay for the webhook):**

| Port | From | Purpose |
|---|---|---|
| 443/tcp | Internet | App, admin, **and Razorpay webhook** delivery |
| 80/tcp | Internet | ACME/HTTP → 301 to 443 |
| 7070/tcp | **loopback only** | App port; must **not** be reachable off-box (bound to `127.0.0.1`) |

**Outbound (the app is useless if these are blocked):**

| Host | Port | Why |
|---|---|---|
| `mnvxojjbbiqmymlatigh.supabase.co` | 443 | Main DB, admin auth, RPCs |
| `massive-panda-19626.upstash.io` | 6379 (TLS/`rediss`) | OTP store + rate-limit state |
| `api.razorpay.com` | 443 | Create/verify/capture payments |
| `smtp.gmail.com` | 587 | Email OTP + order notifications |
| Web-push endpoints (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`) | 443 | Push notifications (varied hosts → allow general outbound 443) |

- [ ] 🔴 Confirm outbound **6379** to Upstash is allowed — campus firewalls frequently block non-standard ports; if blocked, **OTP login fails for everyone** and `/api/health` returns 503.
- [ ] 🔴 Confirm inbound **443** reaches the box from the public internet (Razorpay must POST the webhook in).
- [ ] 🟡 Confirm outbound **587** to Gmail is allowed (many institutions block SMTP egress → OTP emails silently fail).

---

## 5. Zero-downtime reload, logs, rollback

**Zero-downtime reload**

- [ ] Option A (single container): `docker compose -f docker-compose.prod.yml up -d --no-deps --build backend` recreates with a ~1-2s blip. Deploy **off-peak**; nginx returns 502 only during that window.
- [ ] Option B (systemd): `sudo systemctl restart spoon` = sub-second gap (`Restart=always`, `RestartSec=3`). For *true* zero-downtime, run a second instance on `127.0.0.1:7071`, put both in an nginx `upstream`, and restart one at a time:

```nginx
upstream spoon_app { server 127.0.0.1:7070; server 127.0.0.1:7071; }
# proxy_pass http://spoon_app;
```

  (Accept the §1a caveat: two processes ⇒ two in-memory rate-limit buckets.)

**Log locations**

| Mode | Command | Notes |
|---|---|---|
| Docker | `docker compose -f docker-compose.prod.yml logs -f` | Capped at 10m×5 via json-file driver |
| systemd | `journalctl -u spoon -f` | `console.log/console.error` → journald; set up `journald` size limits or logrotate |
| nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` | Ships with logrotate on Debian/Ubuntu |

**Rollback plan** — tag every release so you can jump back in seconds:

- [ ] 🔴 Before deploying, record the current good ref: `git rev-parse HEAD` and (Option A) keep the previous image: `docker tag spoon:latest spoon:prev`.
- Option A rollback: `docker tag spoon:prev spoon:latest && docker compose -f docker-compose.prod.yml up -d` (or rebuild from the known-good SHA).
- Option B rollback: `cd /opt/spoon && sudo -u spoon git checkout <good-SHA> && sudo -u spoon npm ci --omit=dev && sudo systemctl restart spoon`.
- Because the server is **stateless** (all state lives in Supabase/Upstash), rollback carries **no data-migration risk** — it's purely swapping code + restarting.

---

## 6. Launch-day checklist (copy into the runbook)

- [ ] 🔴 `package.json` has `engines.node >= 20`; box runs Node 20.x (`node -v`).
- [ ] 🔴 `NODE_ENV=production` is actually set in the running process (`docker exec … env` / `systemctl show spoon -p Environment`) — verifies CORS whitelist is active.
- [ ] 🔴 Secrets live in `/etc/spoon/spoon.env` (mode 600, owner `spoon`), **not** under the served repo root; confirm `curl -I https://spoon.tcetswb.org/backend/.env` returns **404**.
- [ ] 🔴 `RAZORPAY_WEBHOOK_SECRET` = the dashboard webhook secret; send a Razorpay test webhook and confirm 200 (not 401/429).
- [ ] 🔴 Rate-limit landmines addressed: webhook exempted from payment limiter; heartbeat/general limiter adjusted or network confirmed per-device-IP (§1a).
- [ ] 🔴 Firewall: inbound 443 open to internet; outbound 443 + 6379 + 587 open; 7070 loopback-only.
- [ ] 🔴 TLS certs valid for **both** `spoon.tcetswb.org` and `admin.spoon.tcetswb.org`; `curl -I http://spoon.tcetswb.org` returns 301→https.
- [ ] 🔴 `curl -s https://spoon.tcetswb.org/api/health` returns `200 {"status":"healthy"}`.
- [ ] 🟡 `docker install` runs as non-root / systemd `User=spoon`; container/service hardening applied.
- [ ] 🟡 External uptime monitor + alert on `/api/health`.
- [ ] 🟡 Known-good git SHA recorded and previous image tagged for rollback.
- [ ] 🟡 Log rotation confirmed (json-file caps / journald size limits) so a traffic spike can't fill the disk.
- [ ] ⚪ End-to-end smoke on the real domain: OTP email arrives → login → place a ₹ order → Razorpay LIVE capture → webhook confirms → push notification received.

**Files referenced (all absolute):** `c:/Users/arjun/Desktop/spoon/v1/backend/server.js`, `c:/Users/arjun/Desktop/spoon/v1/Dockerfile`, `c:/Users/arjun/Desktop/spoon/v1/docker-compose.yml`, `c:/Users/arjun/Desktop/spoon/v1/package.json`, `c:/Users/arjun/Desktop/spoon/v1/package-lock.json`, `c:/Users/arjun/Desktop/spoon/v1/backend/routes/health.js`, `c:/Users/arjun/Desktop/spoon/v1/backend/routes/config.js`, `c:/Users/arjun/Desktop/spoon/v1/backend/routes/push.js`, `c:/Users/arjun/Desktop/spoon/v1/backend/routes/auth.js`, `c:/Users/arjun/Desktop/spoon/v1/.dockerignore`, `c:/Users/arjun/Desktop/spoon/v1/.gitignore`, `c:/Users/arjun/Desktop/spoon/v1/deploy.ps1`.


---

## D. Security & Safety Hardening for a Restrictive Institution Server

I have everything I need. Here is the security hardening section, grounded in the actual code.

---

# 🔐 Security & Safety Hardening — Restrictive Institution Server

*Dimension owner note: every claim below is tied to a real file in `c:/Users/arjun/Desktop/spoon/v1`. Ports, hostnames, and env var names are the live ones. Hand this to college IT verbatim.*

## 0. Blocker summary (read this first)

| # | Item | Severity | One-line |
|---|------|----------|----------|
| A | `docker-compose.yml` is DEV config (`NODE_ENV=development` → CORS reflects *any* origin, bind-mounts source + `.env`, root) | 🔴 BLOCKER | Do **not** `docker compose up` in prod. |
| B | Campus NAT + `apiLimiter` 300/min **per IP** → whole college shares ~1 public IP → everyone throttled at lunch rush | 🔴 BLOCKER | Retune limits (§6). |
| C | Razorpay **inbound webhook** to `/api/payment/webhook` is (1) rate-limited to 50/15min per IP against Razorpay's own few IPs and (2) must stay publicly reachable through the institution firewall | 🔴 BLOCKER | Exempt webhook from limiter + firewall passthrough (§1, §6). |
| D | Required **outbound** egress (Supabase 443, Upstash TLS 6379, Gmail 587, Razorpay 443) will be blocked by default on a locked-down campus network | 🔴 BLOCKER | Egress allowlist (§1). |
| E | App binds `0.0.0.0:7070` (all interfaces), runs as **root** in container | 🟡 | Bind loopback + non-root (§1, §8). |
| F | Session tokens **never expire**; `session_created_at` is stored but never checked | 🟡 | Add TTL or accept in writing (§7). |
| G | Helmet `contentSecurityPolicy` disabled | 🟡 | Ship a tailored CSP report-only (§3). |

---

## 1. Network exposure, TLS, and the campus firewall 🔴

**Ground truth:** `backend/server.js:301` is `app.listen(PORT, () => {…})` with **no host argument** → Node binds `0.0.0.0:7070` (every interface). On an institution box that means the API is directly reachable on the LAN, bypassing any proxy/TLS.

**Target posture:** one reverse proxy (nginx) terminates TLS on **:443 only**; Node listens on **loopback only**; the institution firewall allows **:443 in** and a tight **egress allowlist out**.

### 1a. Bind Node to loopback

- [ ] 🟡 **Bare-metal / systemd Node:** make the bind host configurable and default safe.
  ```js
  // backend/server.js — replace app.listen(PORT, () => {…})
  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => { console.log(`🚀 ${HOST}:${PORT}`); });
  ```
- [ ] 🟡 **Docker (recommended here):** keep the app on `0.0.0.0` *inside* the container, but **publish only to host loopback** so the LAN can't reach it:
  ```bash
  docker run -d --name spoon --env-file backend/.env -e NODE_ENV=production \
    -p 127.0.0.1:7070:7070 spoon:latest   # NOT -p 7070:7070
  ```

### 1b. nginx reverse proxy (drop-in)

- [ ] 🔴 Put Spoon behind nginx for both `spoon.tcetswb.org` and `admin.spoon.tcetswb.org`.
  ```nginx
  # /etc/nginx/sites-available/spoon.conf
  server {
    listen 443 ssl http2;
    server_name spoon.tcetswb.org admin.spoon.tcetswb.org;

    ssl_certificate     /etc/letsencrypt/live/spoon.tcetswb.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/spoon.tcetswb.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # HSTS at the proxy (see §2) — only enable once ALL subdomains are HTTPS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
      proxy_pass http://127.0.0.1:7070;
      proxy_set_header Host              $host;
      proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for; # real client IP
      proxy_set_header X-Forwarded-Proto $scheme;                    # so req.protocol=https
      proxy_read_timeout 35s; # > Cloud Run's 30s app timeout habits
    }
  }
  server { listen 80; server_name spoon.tcetswb.org admin.spoon.tcetswb.org;
           return 301 https://$host$request_uri; }   # force HTTPS
  ```
- [ ] 🔴 **Webhook must stay public.** `/api/payment/webhook` (`routes/payment.js:240`) is called by Razorpay's servers over the public internet. If IT IP-allowlists the whole box, **payments will be captured but orders never confirmed** (the webhook drives `confirm_payment_and_order`). Do **not** geo/IP-block the app vhost; the webhook is safe because it is HMAC-verified with a timing-safe compare (`payment.js:165`, `validateWebhookSignature`).

### 1c. Firewall rules — the institution *will* block these by default 🔴

Spoon is a thin shell over 4 external SaaS. If any egress below is blocked, a core flow breaks — often **silently** (see §6 fail-open). Give IT this exact table:

| Direction | Host / Port | Why | If blocked |
|-----------|-------------|-----|-----------|
| **IN** 443 | `spoon.tcetswb.org`, `admin.spoon.tcetswb.org` | App + Razorpay webhook | Whole app + payment confirmation dead |
| OUT 443 | `mnvxojjbbiqmymlatigh.supabase.co` | Postgres/RLS/admin JWT | Nothing works |
| OUT 6379 (TLS) | `massive-panda-19626.upstash.io` | OTP store + OTP rate limit (`rediss://`) | OTP silently degrades to per-process memory (§6) |
| OUT 587 | `smtp.gmail.com` | Email OTP + order emails (`nodemailer`) | **Login broken** — no OTP delivered |
| OUT 443 | `api.razorpay.com` | Create order / verify payment | Checkout dead |
| OUT 80/443 | Let's Encrypt (ACME) | TLS cert renewal | Cert expiry outage in ≤90 days |

- [ ] 🔴 Confirm **outbound TLS on 6379** is allowed. Most campus firewalls block non-standard ports; `services/redisClient.js` connects `rediss://…:6379` and on failure the app keeps running on an in-memory fallback with **no visible error to users**.

---

## 2. Helmet HSTS & headers 🟡

Helmet is enabled (`server.js:78`) and already sets HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. Because TLS is terminated at nginx and Node speaks plain HTTP on loopback, **set HSTS at the proxy** (done in §1b) as the source of truth.

- [ ] 🟡 Use `max-age=31536000; includeSubDomains`. Add `; preload` **only after** verifying every `*.spoon.tcetswb.org` host is HTTPS-only — `includeSubDomains`/`preload` will hard-break any HTTP subdomain, including `admin.spoon.tcetswb.org`.
- [ ] ⚪ Confirm `app.set('trust proxy', 1)` (`server.js:65`) so Express sees `req.protocol === 'https'` behind nginx (needed if you later add HTTPS-only cookie/redirect logic).

---

## 3. Content Security Policy — currently OFF 🟡

**Ground truth:** `server.js:78-83` disables `contentSecurityPolicy`, `crossOriginOpenerPolicy`, `crossOriginResourcePolicy`, `crossOriginEmbedderPolicy`. The in-code comment correctly explains why (inline `<script>`, Razorpay checkout popup, cross-subdomain assets).

**Risk assessment:** Stored-XSS was already mitigated with `escapeHtml` (per system profile), so CSP is **defense-in-depth**, not the only wall — hence 🟡 not 🔴. But for a public, thousands-of-users launch handling **live money**, a missing CSP means any single escaping miss becomes full account/session/token theft. Recommended: ship CSP in **Report-Only** first (zero risk of breakage), watch reports for a day, then enforce.

- [ ] 🟡 Add a tailored CSP in **report-only** mode. Verify the exact external origins in the HTML (`public/*.html`) before enforcing — this template assumes Razorpay checkout + Supabase:
  ```js
  // server.js — replace contentSecurityPolicy:false
  contentSecurityPolicy: {
    useDefaults: true,
    reportOnly: true,                       // <-- observe first, enforce later
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
      frameSrc:   ["https://api.razorpay.com", "https://checkout.razorpay.com"],
      connectSrc: ["'self'", "https://mnvxojjbbiqmymlatigh.supabase.co",
                   "wss://mnvxojjbbiqmymlatigh.supabase.co",
                   "https://api.razorpay.com", "https://lumberjack.razorpay.com"],
      imgSrc:     ["'self'", "data:", "https:"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      fontSrc:    ["'self'", "data:"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      frameAncestors: ["'none'"]            // clickjacking defense
    }
  }
  ```
- [ ] ⚪ Keep COOP/CORP disabled until the Razorpay popup flow is re-tested with them on — enabling blindly breaks checkout (as the comment warns). Document this as an *accepted deviation* rather than an oversight.

---

## 4. Secrets — protect the service-role key above all 🔴

**Ground truth (good):** `.env` and `backend/.env` are gitignored; `.dockerignore` excludes `.env`, `.env.*`, `tests`, `*.md`, `deploy.ps1`. Only `backend/.env.example` (placeholders) is tracked. **Secrets are not in the repo or image.** ✅

**The crown jewel:** `SUPABASE_SERVICE_ROLE_KEY` is used in `services/userService.js:38` and `routes/health.js:70` and **bypasses Row Level Security entirely** — anyone holding it has god-mode read/write on every table (users, orders, wallets). Treat it like a root password.

- [ ] 🔴 On the institution server, store `backend/.env` root-owned, `chmod 600`, outside any web root; never bake it into the image.
  ```bash
  chown root:root /opt/spoon/backend/.env && chmod 600 /opt/spoon/backend/.env
  ```
- [ ] 🔴 **Never** run the DEV `docker-compose.yml` (`volumes: .:/app` mounts `backend/.env` into the container even though `.dockerignore` keeps it out of the *image*). Use `--env-file` at `docker run` instead (§1a).
- [ ] 🟡 Rotate any secret ever pasted into a Slack/email/ticket during handover to IT. Rotate the **service-role key** and **Razorpay LIVE secret** if there's *any* doubt they leaked during the migration.
- [ ] ⚪ Add a boot-time guard so a missing critical secret fails loudly instead of at first request (currently `getClient()` throws lazily). Fail fast > silent 500s at launch.

---

## 5. Admin dashboard — add a second lock 🟡

**Ground truth:** `admin.spoon.tcetswb.org` and `/api/admin/*` are gated by Supabase Auth JWT + `is_admin` (`routes/admin.js:52,87`; `middleware/sessionAuth.requireAdminSession`). That's solid app-layer authz, but the login page is on the **public internet** for the whole world to brute/phish.

- [ ] 🟡 Add a network layer in front of Supabase JWT — pick one:
  - **IP allowlist** the admin vhost to campus canteen/office ranges:
    ```nginx
    server { server_name admin.spoon.tcetswb.org;
      allow 10.0.0.0/8; allow 192.168.0.0/16;   # campus ranges
      deny all;
      location / { proxy_pass http://127.0.0.1:7070; /* + proxy headers */ } }
    ```
  - **or** campus-VPN-only, **or** nginx **basic-auth** in front of the Supabase login as a cheap second factor.
- [ ] ⚪ Keep the existing admin audit logs — stock updates already log `User / Item / is_available` with timestamps (`routes/admin.js:181`). Extend the same pattern to price/menu/refund actions.

---

## 6. Rate limiting behind NAT — will misfire at launch 🔴

**Ground truth:**
- `apiLimiter` = **300 req / min per IP** on all `/api/*` (`server.js:154-167`).
- `paymentLimiter` = **50 req / 15 min per IP** on `/api/payment/*` (`server.js:142-166`) — **and this covers `/api/payment/webhook`**.
- `express-rate-limit` keys on `req.ip`, which with `trust proxy:1` is the **left-most X-Forwarded-For** IP.
- Per-email OTP limit = **5 / 15 min** (`services/redisOtpStore.js:22-23`), enforced in `routes/auth.js:83`. The send-OTP route has **no per-IP cap of its own** — it only rides the global `/api` limiter.

**Why this breaks on launch day:**
1. **Campus NAT collapse.** Thousands of students on campus WiFi egress through a *handful* of public IPs. `req.ip` will be that shared NAT IP for everyone. 300 req/min shared across a thousand people = instant `429 Too many requests` on *every* `/api` call (menu, orders, wallet) at lunch. This is the single biggest availability risk in this dimension.
2. **Webhook starvation.** Razorpay delivers all webhooks from its own small IP set. 50/15min per IP against Razorpay's IPs can be exceeded during a busy rush → Razorpay webhooks get `429` → orders silently fail to confirm.

- [ ] 🔴 **Exempt the webhook** from the payment limiter (it's HMAC-protected, doesn't need IP throttling):
  ```js
  const paymentLimiter = rateLimit({
    windowMs: 15*60*1000, max: 50,
    skip: (req) => req.path === '/webhook',   // Razorpay-signed, no IP limit
    standardHeaders: true, legacyHeaders: false,
  });
  ```
- [ ] 🔴 **Retune `apiLimiter` for shared NAT.** Per-IP throttling is fundamentally coarse behind NAT, so either raise it far above peak campus concurrency or drop the blanket cap and rely on per-user + per-email limits:
  ```js
  const apiLimiter = rateLimit({
    windowMs: 60*1000,
    max: 6000,                                // sized for shared campus egress IP
    keyGenerator: (req) =>                    // prefer per-user when logged in
      req.headers['x-user-email']?.toLowerCase().trim() || req.ip,
    standardHeaders: true, legacyHeaders: false,
  });
  ```
  (Keying authenticated traffic by `x-user-email` sidesteps NAT collapse; the header is DB-validated in `middleware/userAuth.js:31` for protected routes, so abuse still hits the per-email OTP/session limits.)
- [ ] 🟡 **Verify the real client IP arrives.** `trust proxy:1` is correct **iff there is exactly one proxy hop** (your nginx). If IT fronts nginx with *another* load balancer, `req.ip` becomes the intermediate proxy and rate limits/logs are wrong (and XFF becomes spoofable). Count the hops and set `trust proxy` to that number. Test after launch:
  ```bash
  curl -H "X-Forwarded-For: 1.2.3.4" https://spoon.tcetswb.org/api/health -I
  # Then confirm logs/limits show the true client IP, not nginx's.
  ```
- [ ] 🟡 **Fail-open rate limiter.** `redisOtpStore.checkRateLimit` returns `{allowed:true}` on *any* Redis error (`redisOtpStore.js:296-299`) and `isConnected()` **always returns `true`** (`redisOtpStore.js:319-323`), so if Upstash is unreachable the OTP throttle silently disappears and OTPs are served from per-process memory. Acceptable on a single node, but **document it** and alert on Redis health (§11) so you're not blind.

---

## 7. No-expiry session tokens 🟡

**Ground truth:** `verify-otp` mints `crypto.randomUUID()` (`auth.js:220`) into `users.active_session_token`. `validateSession` (`userService.js:336-363`) does a plain `storedToken === sessionToken` string compare and **never checks `session_created_at`** — even though that column is written on every login. Result: **a stolen `x-session-token` + `x-user-email` grants access forever**, until the user logs in on another device (which rotates the token via the one-active-device rule).

- [ ] 🟡 Add a TTL check (smallest possible change, no new columns needed):
  ```js
  // userService.validateSession — after fetching the row
  const { data } = await client.from('users')
    .select(`${tokenColumn}, session_created_at`).eq('email', normalizedEmail).single();
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;              // 30-day re-auth
  const fresh = Date.now() - new Date(data.session_created_at).getTime() < MAX_AGE_MS;
  return { valid: data[tokenColumn] === sessionToken && fresh };
  ```
- [ ] ⚪ Ship an admin "force logout all" = one SQL `UPDATE users SET active_session_token = NULL` for incident response.
- [ ] ⚪ If you choose **not** to add a TTL before launch, that's a defensible call for a low-value canteen session — but record it as a **written accepted risk** in this dossier (student data + wallet balance are the exposure), not silence.

---

## 8. Container hardening 🟡

**Ground truth (`Dockerfile`):** `FROM node:20-slim` (floating tag), `RUN npm install --only=production --no-audit`, `COPY . .`, **no `USER`** → the process runs as **root**. `docker-compose.yml` is DEV (`NODE_ENV=development`, `.:/app` bind mount, `restart: always`).

- [ ] 🔴 **Do not deploy with `docker-compose.yml`.** `NODE_ENV=development` flips CORS at `server.js:107` to `origin: true`, which **reflects any Origin with `credentials:true`** — a CSRF/credential-leak hole for a payments app. Run the image directly with `NODE_ENV=production` (§1a) or write a separate `docker-compose.prod.yml` with no bind mount and no dev env.
- [ ] 🟡 Add a non-root user and switch to reproducible installs. `node:20-slim` ships a ready-made `node` user (UID 1000):
  ```dockerfile
  FROM node:20-slim
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev            # deterministic; replaces `npm install --only=production`
  COPY . .
  ENV PORT=7070 NODE_ENV=production
  EXPOSE 7070
  USER node                        # drop root
  CMD ["node", "backend/server.js"]
  ```
  (`--only=production` is deprecated; `npm ci --omit=dev` is the modern, lockfile-pinned form. Requires `package-lock.json` in the build context — confirm it's committed.)
- [ ] 🟡 **Pin the base image by digest** so a silently re-tagged `node:20-slim` can't change under you: `FROM node:20-slim@sha256:<digest>`. Refresh the digest on a schedule to pick up patches.
- [ ] ⚪ Add a container healthcheck hitting the existing endpoint:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:7070/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  ```
- [ ] ⚪ Add `engines` to `package.json` (`"engines": {"node": "20.x"}`) — there's no version pin today, so a host running Node 18/22 is undetected.

---

## 9. Dependency & patch management 🟡

- [ ] 🟡 Run before launch and fix anything high/critical:
  ```bash
  npm audit --omit=dev
  npm audit fix          # review the diff; avoid --force on launch eve
  npm outdated
  ```
  Deps are recent (`express ^4.21.2`, `helmet ^8.2.0`, `@supabase/supabase-js ^2.87.0`, `razorpay ^2.9.6`) — good baseline, just verify no new advisories the morning of.
- [ ] ⚪ Schedule monthly `docker pull node:20-slim` + rebuild to absorb base-image CVE patches (institution servers rot fast once handed off).

---

## 10. Confirmed-good — don't touch these ✅

| Control | Evidence |
|---------|----------|
| Razorpay webhook HMAC, timing-safe | `payment.js:165` `crypto.timingSafeEqual`; `payment.js:258` `validateWebhookSignature`; raw body preserved for signature (`server.js:127-133`) |
| TLS in transit to all backends | `rediss://` (Upstash), `https://` Supabase, SMTP `smtp.gmail.com:587` STARTTLS |
| Secrets out of repo & image | `.gitignore` + `.dockerignore` exclude `.env`; only `.env.example` tracked |
| RLS bypass isolated to backend | service-role key only server-side (`userService.js:38`); clients get anon key |
| Global error handler (no stack leaks) | `server.js:278-287` returns generic `Internal server error` |
| CORS whitelist in prod | `server.js:106-117` restricts to `spoon.*` / `admin.spoon.*` / `FRONTEND_URL` |
| One-active-device enforcement | token rotation on login (`userService.updateSession`) |
| Payment idempotency + capture guard | atomic RPCs + `status==='captured'` guard (per profile), duplicate-webhook handling (`payment.js:328`) |
| AI pentest (Shannon) passed authz/IDOR | prior sign-off |

⚠️ **One live-money caveat to verify before launch (🔴 if wrong):** `deploy.ps1:60-62` sets `RAZORPAY_WEBHOOK_SECRET = RAZORPAY_SECRET` (the API secret). Razorpay's dashboard webhook signature uses the **webhook secret you configure on the webhook**, which is a *separate* value. If they don't match, `validateWebhookSignature` fails on every real webhook and **orders never confirm despite money being captured**. Confirm the webhook secret in the Razorpay dashboard equals what's in `backend/.env` as `RAZORPAY_WEBHOOK_SECRET` on the new server.

---

## 11. Backups, DR, logging, incident response — because this is LIVE money 🔴/🟡

- [ ] 🔴 **Confirm Supabase backups are on.** All state (users, orders, wallet balances, LIVE payment records) lives in Supabase — the institution server is stateless and disposable. Free tier = daily backups / 7-day retention; enable **Point-In-Time-Recovery (PITR)** on a paid plan given real money is involved. Verify in Supabase → Database → Backups **before** launch.
- [ ] 🟡 **Test a restore** on a throwaway Supabase branch — an untested backup is not a backup.
- [ ] ⚪ Upstash Redis holds only OTPs + rate counters (TTL'd); **no backup needed** — but do enable Upstash's own persistence/eviction alerts.
- [ ] 🟡 **Centralized logging.** The app logs to stdout via `console.log/error` throughout. On the institution box, capture and ship:
  ```bash
  docker logs -f spoon | tee -a /var/log/spoon/app.log        # or journald if systemd
  ```
  Ensure logs rotate and retain ≥30 days. The stock-update audit line (`admin.js:181`) and error handler give you a usable trail — centralize it.
- [ ] 🔴 **Monitor the health endpoint.** Point an external uptime check at `https://spoon.tcetswb.org/api/health` (`routes/health.js`) — it returns `503` when Redis is down and `degraded` when Supabase is down. Alert the founder on non-200 so the silent Redis-fallback (§6) doesn't hide an outage.
- [ ] 🔴 **Incident-response contacts** — write these into this dossier and pin them in the canteen ops channel:
  - Founder (primary on-call): name + phone.
  - College IT server owner: name + phone.
  - Razorpay dashboard admin (refunds/disputes/fraud): who, and where the login lives.
  - Supabase project owner (pause/restore/rotate-key): who.
- [ ] 🟡 **"Break glass" runbook** (one page): how to (a) rotate the Razorpay LIVE secret + service-role key, (b) `UPDATE users SET active_session_token=NULL` to force-logout everyone, (c) pause the Supabase project, (d) flip the app to a maintenance page at nginx. Live money means a 3am incident *will* happen; decide the moves now, not then.

---

## 12. Launch-eve go/no-go checklist (this dimension)

- [ ] 🔴 Running with `NODE_ENV=production` (NOT `docker compose up`) — CORS whitelist active
- [ ] 🔴 nginx terminates TLS on :443; Node reachable only on `127.0.0.1:7070`; HTTP→HTTPS redirect live
- [ ] 🔴 Firewall: :443 in; egress allowlist for Supabase/Upstash-6379/Gmail-587/Razorpay verified with a real request each
- [ ] 🔴 `/api/payment/webhook` publicly reachable **and** exempt from the payment rate limiter; test webhook fires end-to-end
- [ ] 🔴 `apiLimiter` retuned for campus NAT (per-user keying or high cap); verified a second student on the same WiFi isn't throttled
- [ ] 🔴 Supabase backups/PITR confirmed on; restore rehearsed; health-check alerting live; IR contacts written down
- [ ] 🔴 Razorpay dashboard webhook secret == `RAZORPAY_WEBHOOK_SECRET` on the new box
- [ ] 🟡 Container: non-root `USER node`, `npm ci --omit=dev`, base image digest-pinned, `npm audit` clean
- [ ] 🟡 Session TTL added (or accepted-risk signed); admin vhost behind IP allowlist/VPN/basic-auth
- [ ] 🟡 CSP shipped report-only; HSTS at proxy (`includeSubDomains` only after all subdomains confirmed HTTPS)
- [ ] 🟡 `trust proxy` hop count matches the real proxy chain; verified real client IP in logs


---

## E. Compliance & Legal (India, student PII, live payments)

# Compliance & Legal Readiness — India, Student PII & Live Payments

*Dimension owner note: every claim below was verified against the real repo (`c:/Users/arjun/Desktop/spoon/v1`). The app is served by `express.static(rootDir)` where `rootDir = backend/../` (repo root), and `GET /` redirects to `/public/index.html` (`backend/server.js:254-265`). **Therefore every policy page's real public URL is `https://spoon.tcetswb.org/public/<file>.html`** — not `/<file>.html`. Use the `/public/...` form in the Razorpay dashboard fields.*

---

## 0. Blocker summary — fix these before you flip the switch

| # | Item | State in repo | Urgency |
|---|------|---------------|---------|
| 1 | **Terms & Conditions** page | **Does not exist** (glob of `public/*.html` returns no `terms.html`) | 🔴 LAUNCH-BLOCKER |
| 2 | **Refund / Cancellation Policy** page | **Does not exist**; refunds are wallet-coin only (not to source) and this is undisclosed | 🔴 LAUNCH-BLOCKER |
| 3 | **Shipping / Delivery (Pickup/Fulfilment) Policy** page | **Does not exist** | 🔴 LAUNCH-BLOCKER (Razorpay mandatory field) |
| 4 | **Contact Us** with real legal details | Only `public/help.html` with placeholders `support@spoonapp.com`, `+91-XXXXXXXXXX` | 🔴 LAUNCH-BLOCKER |
| 5 | **Privacy Policy** substance | `public/privacy.html` is a **generic placeholder** (see §1) | 🔴 LAUNCH-BLOCKER |
| 6 | Policy links **publicly reachable** | Policy pages are **orphaned** — nothing links to `privacy.html`; a Razorpay reviewer / logged-out user cannot find them | 🔴 LAUNCH-BLOCKER |
| 7 | **Consent capture at signup** | `public/signup.html` collects only a Nickname; **no consent checkbox, no policy links** | 🔴 LAUNCH-BLOCKER (DPDP §6) |
| 8 | **Grievance Officer / DPO** contact | Absent everywhere | 🔴 LAUNCH-BLOCKER (DPDP §13 + E‑Commerce Rules) |
| 9 | Cookie / localStorage notice | Under-disclosed (see §5) | 🟡 important |
| 10 | Minors (under-18) handling | No age gate, `privacy.html` wrongly says "under 13" | 🟡 important |
| 11 | DPA / MOU with the institution | None in repo | 🟡 important |
| 12 | Retention schedule + session-token expiry | Session token has **no server-side expiry**; no retention policy | 🟡 important |
| 13 | FSSAI display, GST posture | Not addressed | ⚪ nice-to-have (institution's canteen owns FSSAI) |

**Practical consequence of leaving 1–6 unfixed:** Razorpay routinely audits *live* merchant sites and can put settlements **on hold or deactivate the account** for missing mandatory policy pages. With thousands of students paying tomorrow, an account hold = money collected but not settled = a refund crisis. Treat 1–6 as hard gates.

---

## 1. Privacy Policy audit — verdict: **PLACEHOLDER, not fit for launch** 🔴

`public/privacy.html` exists and is styled, but the *content* is a boilerplate template. Concrete defects found by reading the file:

| Line(s) | Problem | Required fix |
|---------|---------|--------------|
| 101–102 | Contact is `privacy@spoonapp.com` + `+91-XXXXXXXXXX` — **wrong domain and a placeholder phone** | Real address on `@tcetswb.org` / institutional email + working phone |
| 83–87 | "not intended for children under **13**" — this is the US COPPA age. **India's DPDP Act treats anyone under 18 as a child.** | Rewrite for **under 18** + parental/guardian consent (see §6) |
| 26 | "Last Updated: December 8, 2025" but no versioning/who published it | Add legal entity/operator name + institution as Data Fiduciary |
| 34–38 | Lists Name/phone/order/payment but **omits email** (the primary identifier — signup is email-OTP) and **wallet data** | Enumerate the *actual* PII set (see §3 inventory) |
| 49–58 | "Information Sharing" names no processors | Name sub-processors: **Supabase** (DB), **Upstash Redis** (OTP), **Razorpay** (payments), **Google/Gmail SMTP** (email) — all offshore/cloud |
| — | **No retention period**, **no Grievance/Data-Protection Officer**, **no breach-notification statement**, **no Data Fiduciary vs Processor clarity**, **no lawful basis (consent)** | All are DPDP requirements — add them |
| 76–81 | Cookie section says localStorage holds "cart items and login status" only | Under-disclosure — it also stores the **session token** and a **full user object incl. name/email/phone** (see §5) |

**Action:**
- [ ] 🔴 Rewrite `public/privacy.html` to a real DPDP-compliant policy (outline in §3). Keep the file path so existing links don't break.

---

## 2. Razorpay LIVE-account mandatory pages — build all five

Razorpay's live-merchant website checklist requires **five publicly-accessible pages**, linked from the site, before it will keep a live account healthy: **Privacy Policy, Terms & Conditions, Refund/Cancellation Policy, Shipping/Delivery Policy, Contact Us.** For a **campus food pre-order** context, here is exactly what each must say and where to put it.

Create these files in `public/` (so they inherit the same CSS/nav and are served at `https://spoon.tcetswb.org/public/<file>.html`):

### 2a. `public/terms.html` — Terms & Conditions 🔴 *(missing)*
Content outline:
- Operator legal identity + that the service runs **on/for TCET (Thakur College)** campus canteen.
- **Eligibility:** restricted to TCET-issued/verified emails; one active device (state the 15s heartbeat single-session enforcement so users aren't surprised by forced logout).
- **What Spoon is:** a *pre-ordering and pickup* platform for the campus canteen — **no home delivery**.
- **Ordering & pricing:** prices in INR, inclusive of applicable taxes; menu/availability may change; canteen may reject/refund if an item is unavailable.
- **Payments:** processed via **Razorpay** (UPI/card/net-banking) and via the closed-loop **Spoon Wallet** (coins). Wallet coins are **not redeemable for cash** and are usable only inside Spoon.
- **User conduct / acceptable use** (see §7), account suspension rights.
- **Liability limits, governing law = India, jurisdiction = Mumbai/Maharashtra courts.**
- Link to Privacy, Refund, Shipping/Pickup policies.

### 2b. `public/refunds.html` — Refund & Cancellation Policy 🔴 *(missing — and highest-risk gap)*
**This must match what the code actually does.** Verified refund behaviour from `backend/routes/orders.js` and `backend/services/walletService.js`:
- Refunds are issued as **Spoon Wallet coins** (`walletService.creditCoins(..., 'REFUND', ...)`, refund amount = full order total), **not returned to the original card/UPI**.
- Refunds are triggered by **staff/admin** — the **no-show** path (`POST /:orderId/cancel-no-show`, only after `no_show_timeout_minutes` ≈ 10 min elapse) and **force-cancel** (`POST /:orderId/force-cancel`). Help FAQ (`public/help.html`) tells users they can cancel "before it's marked Preparing" — the policy page must reconcile this with the code.

Content outline (write it truthfully):
- [ ] **Cancellation window:** a student may cancel **only while the order is not yet `Preparing`**; once the canteen starts preparation the order is final (food is perishable/made-to-order).
- [ ] **Refund method:** state plainly that eligible refunds are credited as **Spoon Wallet coins (1 coin = ₹1), usable for future orders, and are non-withdrawable to bank/UPI.** *(This is a consumer-fairness disclosure — hiding it is the kind of thing that draws Razorpay disputes.)*
- [ ] **Refund-to-source:** define when a **refund to original payment source** IS available (e.g., duplicate charge, payment captured but order never created, canteen closed). Provide the email to request it.
- [ ] **No-show:** if a prepared order isn't collected within the timeout, it is auto-cancelled and coins refunded to the wallet (mirror `notifyOrderCancelledNoShow`).
- [ ] **Timelines:** wallet credit is instant; source refunds in **5–7 business days** via Razorpay.

### 2c. `public/shipping.html` — Delivery / Fulfilment Policy 🔴 *(missing)*
There is **no physical shipping** — Razorpay still requires this field, so state the pickup model:
- [ ] "Spoon does **not ship** or deliver to addresses. All orders are **prepared for in-person pickup** at the TCET canteen counter."
- [ ] Fulfilment window / operating hours (**8 AM–8 PM**, per `help.html`), typical prep time (10–15 min), pickup identification (order code / `verification_code`).

### 2d. `public/contact.html` — Contact Us 🔴 *(placeholders only today)*
- [ ] Real **operator/entity name**, **campus address** (TCET, Kandivali East, Mumbai), a **monitored support email** on a real domain, a **working phone**, support hours.
- [ ] Include the **Grievance Officer** block (§3) here too. You may repurpose `public/help.html` but you must replace `support@spoonapp.com` and `+91-XXXXXXXXXX`.

### 2e. Wire them into the Razorpay dashboard + the site footer 🔴
- [ ] In Razorpay Dashboard → Account & Settings → Business/Website, paste the five URLs (`https://spoon.tcetswb.org/public/{privacy,terms,refunds,shipping,contact}.html`).
- [ ] Add a **footer with these five links on the pre-login pages** (`public/login.html`, `public/index.html`) so a logged-out reviewer can reach them — verified that `js/core/session-guard.js` does **not** gate these pages, so they will load without login. Also add them to the account menu (`public/account.html`, whose menu currently only shows "Team").

---

## 3. DPDP Act 2023 (India) obligations

**Roles (clarified):** Under DPDP, the **Data Fiduciary** decides *why/how* data is processed; the **Data Processor** processes on the Fiduciary's behalf under contract.
- Cleanest posture: **TCET (the institution) = Data Fiduciary; Spoon's operator = Data Processor** bound by a written contract/DPA (§7).
- **Reality check from the code:** the operator currently controls the Supabase DB, decides features, holds `SUPABASE_SERVICE_ROLE_KEY`, and runs notifications — i.e., exercises fiduciary-like control. If there is **no** contract designating TCET as the Fiduciary, the operator is by default an **independent Data Fiduciary** and carries *all* the obligations below directly. **Do not leave this ambiguous** — sign the DPA/MOU in §7.

**Actual PII inventory (verified) — needed for the notice & the DPA:**

| Data element | Where | Source in repo |
|---|---|---|
| Email (primary ID) | `users`, headers `x-user-email` | email-OTP auth |
| Name / nickname | `users`, `spoon-user` localStorage | `signup.html:46`, `js/auth/signup.js:176-186` |
| Phone number | `orders.phone_number`, Razorpay `notes.phone_number` | `payment.js:90`, `schema…:86` |
| Order history | `orders` (items, total, status, timestamps) | `orders.js` |
| Payment history | `orders.razorpay_payment_id`, `payment_method` | `schema…:88` |
| Wallet balance & ledger | wallet tables / `wallet_transactions` | `walletService.js` |
| Session token (no expiry) | `users.active_session_token`, `spoon-session-token` | `session-guard.js` |

**DPDP checklist:**
- [ ] 🔴 **Consent (§6 DPDP):** capture **free, specific, informed, unambiguous, affirmative** consent at signup (see §4). Consent request must be accompanied by an itemised **Notice** (what data, why, how to withdraw, how to complain).
- [ ] 🔴 **Purpose limitation:** state each purpose (fulfil orders, payment, order notifications, support) and process for nothing else — the privacy policy's "improve our services" must be tied to a specific, disclosed purpose.
- [ ] 🔴 **Grievance redressal / DPO (§13):** publish a **named contact** who answers data questions and complaints, with the escalation path to the **Data Protection Board of India**. Put it on `privacy.html` + `contact.html`.
- [ ] 🟡 **Data-principal rights:** provide a real mechanism to **access, correct, erase, and nominate** — today `privacy.html` *claims* these rights but there is no route; add at least an email-based request process (and note account deletion already exists conceptually via logout, but true erasure needs a manual/Supabase process).
- [ ] 🟡 **Retention limits (storage limitation):** define & document, e.g.:

```text
- OTPs:                purge on use / short TTL in Upstash Redis (already ephemeral) ✅
- Session tokens:      currently NO expiry — add an expiry/rotation (see §0 item 12)
- Order + payment records: retain 8 yrs (Companies Act / tax) then anonymise
- Account PII:         delete/anonymise 12 months after graduation or account closure
- Push subscriptions:  delete on logout / unsubscribe
```

- [ ] 🟡 **Security safeguards (§8(5)):** you already have Helmet, timing-safe webhook HMAC, RLS, rate-limits, escapeHtml — **document them** in the policy as "reasonable security safeguards." Also close the **no-expiry session token** gap (a storage-limitation/safeguard weakness) and confirm TLS to Supabase (443) / Upstash (`rediss://`).
- [ ] 🔴 **Breach-notification readiness (§8(6)):** DPDP requires notifying **both the Data Protection Board and each affected Data Principal** of a personal-data breach. Write a 1-page runbook now (who declares, template email to students, Board notification contact) — you cannot draft this during an incident with thousands of users.

---

## 4. Consent at signup — currently ZERO 🔴

`public/signup.html` (verified) has only a readonly email + a "Nickname" field and a Create Account button — **no consent, no policy links.** Under DPDP §6 this is non-compliant, and it's also the weakest link for a Razorpay/legal review.

- [ ] 🔴 Add an **unticked** consent checkbox above the button in `public/signup.html`:

```html
<label class="consent">
  <input type="checkbox" id="consent-checkbox" required>
  I am 18+ (or have my parent/guardian/institution's consent) and I agree to Spoon's
  <a href="terms.html" target="_blank">Terms</a>,
  <a href="privacy.html" target="_blank">Privacy Policy</a> and
  <a href="refunds.html" target="_blank">Refund Policy</a>.
</label>
```

- [ ] 🔴 In `js/auth/signup.js`, block submission unless `#consent-checkbox` is checked, and **record consent** (timestamp + policy version) against the user row in Supabase so you can prove consent later (DPDP requires demonstrable consent).
- [ ] 🟡 Keep the checkbox **default-unchecked** (pre-ticked consent is invalid under DPDP).

---

## 5. Cookie / localStorage consent notice 🟡

Verified `localStorage` keys (`js/auth/signup.js`, `js/core/session-guard.js`, `js/pages/*`, `js/admin/admin-dashboard.js`):

```text
spoon-session-token   (bearer-equivalent, NO server expiry)
spoon-user            (JSON: name, email, phone)
spoon-user-email
spoon-is-logged-in
spoon-user-phone / spoon-cart
spoon_admin_token     (admin panel)
```

`privacy.html §6` calls this merely "cart items and login status" — an **under-disclosure**, because a session token and full PII object are stored client-side.

- [ ] 🟡 Add a one-time dismissible **notice banner** (not a blocking EU-style cookie wall — India doesn't require consent for strictly-necessary storage, but disclosure is expected):

```text
"Spoon stores a login token and your basic profile in your browser's local
storage to keep you signed in and remember your cart. No third-party
advertising or tracking cookies are used. See our Privacy Policy."  [Got it]
```

- [ ] 🟡 Update `privacy.html §6` to accurately name the session token + profile object and state there is **no** third-party ad/analytics tracking.

---

## 6. Minors (under-18) — real DPDP exposure 🟡→🔴 depending on stance

DPDP **§9** requires **verifiable parental consent** to process a child's (under-18) data and **bans behavioural tracking / targeted advertising** to children. Many first-year TCET students are **17**. `privacy.html` currently cites the wrong age ("under 13").

**Pragmatic, defensible stance (recommend all four):**
- [ ] 🔴 Fix the age reference in `privacy.html` to **18** and add a minors clause.
- [ ] 🟡 Add the **age/consent self-declaration** at signup (the checkbox in §4 covers "18+ or guardian/institution consent").
- [ ] 🟡 **Lean on the institutional relationship:** because access is gated to **TCET-verified emails** and TCET (as Data Fiduciary) already holds enrollment-time parental consent for minors, have the **MOU (§7) explicitly cover processing of minors' data on the institution's authority.** This is the cleanest route to satisfy §9 without building a separate parental-consent flow.
- [ ] 🟡 Confirm in the policy that Spoon runs **no behavioural profiling, no targeted ads** to students (true today — no ad SDKs found), which is the specific §9 prohibition.
- [ ] ⚪ Optional: capture an **age band / DOB** at signup to flag minors for the institution.

> This is a genuine grey area in DPDP; note in the dossier that final wording should be sanity-checked by the college's legal counsel, but the MOU-backed institutional-consent route is the standard campus approach.

---

## 7. Institution-specific: roles, ownership, acceptable-use, MOU/DPA 🟡

- [ ] 🟡 **Sign a Data Processing Agreement / MOU** between the operator and TCET before launch. It must state:
  - **Roles:** TCET = **Data Fiduciary**; Spoon operator = **Data Processor** (or, if operator is independent, name it Fiduciary and TCET as facilitator — pick one explicitly).
  - **Data ownership:** student PII is **owned/controlled by the institution**; the operator processes it **only** to run Spoon, **may not sell, share, or reuse** it, and must **delete or return** all data on termination.
  - **Sub-processors** disclosed & permitted: Supabase, Upstash, Razorpay, Google/Gmail SMTP (all offshore — note cross-border transfer, currently allowed under DPDP except to a future blacklist).
  - **Breach cooperation** timelines (feeds §3 breach runbook), audit rights, security obligations.
  - **Minors** processing authority (§6).
- [ ] 🟡 **Acceptable-Use Policy** (fold into `terms.html`): no reselling, no bulk/automated ordering, no abuse of the wallet/refund flow, no sharing accounts (ties to the single-device enforcement), consequences = suspension.
- [ ] 🟡 **Institution undertaking:** get IT/canteen sign-off on who is the **Grievance Officer** (likely a TCET staff member + operator contact) named in `privacy.html`/`contact.html`.

---

## 8. Adjacent India compliance (don't get blindsided)

| Item | Why it matters here | Urgency |
|---|---|---|
| **Consumer Protection (E‑Commerce) Rules, 2020** | Spoon is an "e-commerce entity": must display legal name, address, **customer-care + Grievance Officer with 48-hr acknowledgement / ~1-month resolution**. Overlaps with DPDP §13 — one Grievance Officer block satisfies both. | 🔴 |
| **Refund-to-wallet-only** | Forcing wallet-coin refunds with no cash-out can be challenged as an unfair term and triggers Razorpay disputes. **Disclose it (§2b)** and offer source-refunds for genuine failures. | 🔴 (disclosure) |
| **Closed-loop wallet / RBI PPI** | The Spoon Wallet (coins, spendable only inside Spoon, non-withdrawable — confirmed `wallet.html:43` "Use coins for instant refunds & payments") is a **closed-system PPI**, which is **outside RBI PPI authorization**. Stays compliant **only if** coins are never cashed out — keep it that way and say so in Terms. | 🟡 |
| **FSSAI** | The canteen selling food needs a valid **FSSAI license**; as the ordering platform, display the canteen's FSSAI number. Institution/canteen owns this. | 🟡 |
| **GST** | If the operator/canteen crosses the GST threshold, prices/invoices need GST handling. Confirm with the college's finance office. | ⚪ |

---

## Final "add-before-launch" checklist (with exact paths)

```text
NEW FILES (in public/, served at https://spoon.tcetswb.org/public/<file>.html):
  [ ] 🔴 public/terms.html          (Terms & Conditions — §2a)
  [ ] 🔴 public/refunds.html        (Refund/Cancellation — §2b, MUST match wallet-coin behaviour)
  [ ] 🔴 public/shipping.html       (Pickup/Fulfilment, "no delivery" — §2c)
  [ ] 🔴 public/contact.html        (real Contact + Grievance Officer — §2d)  or fix help.html

EDIT EXISTING:
  [ ] 🔴 public/privacy.html        (full DPDP rewrite; fix "under 13"->18; real contacts;
                                      name Supabase/Upstash/Razorpay/Gmail; add DPO, retention,
                                      breach clause, Fiduciary/Processor roles — §1, §3)
  [ ] 🔴 public/signup.html         (add unticked consent checkbox + policy links — §4)
  [ ] 🔴 js/auth/signup.js          (block submit without consent; persist consent + version — §4)
  [ ] 🔴 public/login.html + index.html  (footer linking all 5 policy pages, pre-login reachable)
  [ ] 🟡 public/account.html        (add Privacy/Terms/Refund/Help to the account menu)
  [ ] 🟡 add localStorage notice banner + fix privacy.html §6 disclosure

DASHBOARD / OFFLINE:
  [ ] 🔴 Razorpay Dashboard: paste the 5 policy URLs into the website/policy fields
  [ ] 🔴 Write a DPDP breach-notification runbook (Board + students) — §3
  [ ] 🟡 Sign DPA/MOU with TCET (roles, data ownership, minors, sub-processors) — §7
  [ ] 🟡 Name a Grievance Officer / DPO and publish contact — §3, §8
  [ ] 🟡 Define + document retention schedule; add session-token expiry — §3
```

**Bottom line:** the payments/security engineering is in good shape, but the **legal surface is a placeholder**. Four of the five Razorpay-mandatory pages don't exist, the privacy policy is boilerplate with the wrong minors age and fake contacts, there is **no consent capture at signup**, and **no Grievance Officer** — any one of which can get the *live* Razorpay account held mid-launch or expose the operator under DPDP. Items 1–8 in the blocker table must land before you open to the college tomorrow.


---

## F. Launch-Day Scale & Readiness Gaps

Here is the launch-readiness dossier section for the assigned dimension. All findings are grounded in the files cited.

---

## Dimension 4 — Launch-Day Scale & Readiness Gaps

**Verdict: NOT ready to serve thousands of concurrent users tomorrow without the 🔴 fixes below.** The app is functionally sound but is wired to **free/single-tenant infrastructure** (one Gmail account, one small Node process, free-tier Redis, per-IP rate limits) that will fail under a whole-college launch spike. Two failures are near-certain on day one: **Gmail OTP quota exhaustion** and **per-IP rate limiters colliding with campus WiFi NAT**. Recommendation on the infra move is unambiguous: **do NOT cut over to the institution server tomorrow — keep the proven Cloud Run deployment and point the institution DNS at it.**

### Blocker ranking (most severe first)

| # | Gap | Urgency | Day-one failure mode |
|---|-----|---------|----------------------|
| 1 | Gmail SMTP OTP throughput (~500/day cap) | 🔴 BLOCKER | Logins hard-fail with `EMAIL_SEND_FAILED` once quota hits; **no graceful degradation** |
| 2 | Per-IP rate limiters vs campus NAT | 🔴 BLOCKER | Whole campus shares a few egress IPs → checkout (`50/15min/IP`) and API (`300/min/IP`) return `429` for legit users |
| 3 | Same-day cutover to institution server | 🔴 BLOCKER (decision) | Untested runtime/firewall/webhook path on the highest-traffic day, no rollback |
| 4 | Upstash Redis free-tier command cap | 🔴 BLOCKER | ~5 Redis commands/login → cap exhausted → OTP store fails (falls back to per-instance memory, breaks one-device + rate limits) |
| 5 | Supabase tier / auto-pause + heartbeat read storm | 🟡 Important | 15s heartbeat = sustained ~133 reads/s on shared free compute; auto-pause risk |
| 6 | Single Node process, `min-instances 0`, `max 3` | 🟡 Important | Cold start on launch morning; hard ceiling of 240 concurrent requests |
| 7 | No monitoring / alerting / uptime ping | 🟡 Important | Outage discovered by students, not you |
| 8 | No tested Supabase backup/restore | 🟡 Important | No recovery path if data is corrupted on day one |
| 9 | No load test before launch | 🟡 Important | First real load test is 3,000 live students |
| 10 | No rehearsed rollback | 🟡 Important | Panic during an incident |
| 11 | Missing `manifest.json` (PWA not installable) | ⚪ Nice-to-have | No add-to-home-screen; still works in browser |

---

### (a) 🔴 Email OTP throughput — the #1 login blocker

**Evidence.** `backend/services/emailService.js:11-19` hard-codes a single Gmail account (`smtp.gmail.com:587`, `SMTP_EMAIL`/`SMTP_PASSWORD`). Every login calls `sendOTPEmail` (`backend/routes/auth.js:99`). Critically, `send-otp` **awaits the email and returns HTTP 500 `EMAIL_SEND_FAILED` if it fails** (`auth.js:101-110`) — so the moment Gmail's quota trips, **every new login is a hard failure**, not a slow one.

**Why it breaks tomorrow.** A consumer Gmail account caps ~**500 sends/day**; Google Workspace ~**2,000/day**. This same account **also sends order-ready emails** (`backend/services/notificationService.js:64` → `sendOrderReadyEmail`), so OTPs and order notifications **share one quota**. With thousands of logins + order emails, the cap is gone within the first hour of lunch service, and logins stop for everyone.

**Existing throttles (helpful but insufficient).** Per-email OTP limit is 5 per 15 min (`redisOtpStore.js:22`, `MAX_OTP_REQUESTS`); per-IP API limit is 300/min (`server.js:154-163`). These cap abuse, not legitimate first-time logins by thousands of distinct students.

**Do exactly this (pick ONE for tomorrow, in priority order):**

- [ ] **BEST for tomorrow — use the college's own SMTP relay.** TCET IT already runs institutional mail with a high/uncapped quota. Get relay host + credentials from IT and change only the transporter — no per-account 500 cap, no external approval delay:
```js
// backend/services/emailService.js  (replace the createTransport block)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,        // e.g. institution relay (from college IT)
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});
```
Then add `SMTP_HOST`/`SMTP_PORT` to `backend/.env` **and to the `deploy.ps1` env whitelist** (`deploy.ps1:54` — otherwise they will NOT reach prod, per the known env-forwarding gap).
- [ ] **If the college is on Google Workspace** (likely, if student emails are `@tcetmumbai.in`): have IT provision a Workspace sending account (2,000/day) or, better, a relay — immediate and no code change beyond credentials.
- [ ] **Fallback — SendGrid** (instant, no approval wait): free 100/day, paid tiers active immediately; swap transporter to their SMTP or API.
- [ ] **Avoid Amazon SES for tomorrow specifically:** new SES accounts start in **sandbox (200/day, recipients must be verified)** and moving to production **needs a support request that can take ~24h** — too risky to rely on for a launch that is tomorrow.
- [ ] After the switch, **send a test OTP end-to-end from prod** and confirm inbox delivery + SPF/DKIM (institutional relay usually already aligned; SendGrid needs domain auth to avoid spam folder).

---

### (b) 🟡 Supabase tier, auto-pause, and the heartbeat read storm

**Correction to the standard advice (grounded in code):** Spoon talks to Supabase **only through the PostgREST data API over HTTPS 443** (`@supabase/supabase-js` in `userService.js`, `health.js`, and all `.rpc()` calls). It **never opens a raw Postgres connection from Node.** So the usual "you'll exhaust direct connections → use the Supavisor/pgBouncer pooler port 6543" advice **does not apply to the current code** — Supabase manages its internal pool behind PostgREST. Only adopt the pooler port if you later add a direct `pg` client.

**The real Supabase risk is sustained read load from the session heartbeat.** `js/core/session-guard.js:16,43` fires `POST /api/auth/validate-session` **every 15s for every open tab**, and the interval keeps firing even when the tab is backgrounded. Each call is a PostgREST `select` on `users` (`userService.js:validateSession`, `auth.js:352`).

| Concurrent logged-in tabs | validate-session req/min | Sustained reads/sec on Supabase | ~Reads over a 2h lunch |
|---|---|---|---|
| 500 | 2,000 | ~33 | ~240,000 |
| 2,000 | 8,000 | ~133 | ~960,000 |
| 3,000 | 12,000 | ~200 | ~1,440,000 |

This is **continuous** load independent of ordering, on top of menu loads and order-status polling (`js/pages/order.js:465`, `js/pages/order-status.js:220`). On free-tier **shared** compute this can saturate the instance and inflate latency for everyone.

**Do exactly this:**
- [ ] 🔴 **Confirm the project is on a paid Pro tier** before launch — free tier **auto-pauses after 7 days inactivity** (a pause right before launch = cold DB and failed first requests) and has tiny shared compute. Pro removes auto-pause, adds daily backups, and larger compute. Upgrade in the Supabase dashboard for project `mnvxojjbbiqmymlatigh`.
- [ ] Check **Database → Reports** storage headroom (free cap ~500MB). Confirm you are well under.
- [ ] Confirm the `users.email` lookup is indexed — the schema comment (`userService.js:5-11`) says `email TEXT PRIMARY KEY`, so `validateSession`/`getUserByEmail` are index hits. Good; keep it that way.
- [ ] 🟡 **Cut the heartbeat cost:** raise `HEARTBEAT_INTERVAL` from `15000` to `60000` (`session-guard.js:16`) — 4× fewer reads for the same UX — and/or move `validateSession` reads to Redis (already in the stack) so the DB isn't hit every 15s. (Interval change is a one-line, low-risk win; do it tonight.)
- [ ] Verify the institution firewall permits **outbound TCP 443** to `mnvxojjbbiqmymlatigh.supabase.co` (moot if you stay on Cloud Run — see the decision section).

---

### (c) 🔴 Upstash Redis free-tier command cap

**Evidence & per-login cost.** OTP storage and the OTP rate limiter run on Upstash (`redisClient.js:14`, `rediss://massive-panda-19626.upstash.io:6379`). Counting commands from the code:

| Step | Redis commands | Source |
|---|---|---|
| `send-otp` → `checkRateLimit` | `GET` + (`SETEX`\|`INCR`) = 2 | `redisOtpStore.js:249-266` |
| `send-otp` → `storeOTP` | `SETEX` = 1 | `redisOtpStore.js:130` |
| `verify-otp` → `verifyOTP` (success) | `GET` + `DEL` = 2 | `redisOtpStore.js:165,221` |
| **Total per clean login** | **~5 commands** | |

At **2,000 logins/day ≈ 10,000 commands/day**; thousands of logins + resends push well beyond that. Upstash's free plan has a **daily/monthly command cap** (historically ~10,000 commands/day; current free plans commonly cap ~500K commands/month) — **confirm the exact number for this database in the Upstash console.**

**Silent-failure danger.** If the cap is hit (or Redis errors), the code **fails open**: `checkRateLimit` returns `{allowed:true}` on error (`redisOtpStore.js:296-299`) and `isConnected()` **always returns `true`** to force a memory fallback (`redisOtpStore.js:319-323`). That fallback `Map` is **per-instance and non-shared** — so with multiple Cloud Run instances, OTPs stored on instance A can't be verified on instance B, and the OTP rate limit resets per instance. Result: intermittent "No OTP found" login failures under scale.

**Do exactly this:**
- [ ] 🔴 Upgrade the Upstash database to **Pay-as-you-go** (removes the command cap; pennies at this volume). Verify the current plan's cap in the console now.
- [ ] Verify outbound **TLS 6379** to `massive-panda-19626.upstash.io` is reachable from wherever the app runs.
- [ ] Note: the **express-rate-limit** limiters (`server.js:142-167`) use the **default in-memory store, not Redis** — so under multiple instances each instance counts separately and counters reset on cold start. Fine for tomorrow, but know that IP limits are per-instance, not global.

---

### (Cross-cutting 🔴) Per-IP rate limiters vs campus WiFi NAT — will block legitimate checkout

This is the least obvious but most dangerous scale trap, and it is squarely a launch-day readiness gap.

**Evidence.** `server.js:65` sets `trust proxy: 1`, so express-rate-limit keys on the client's public IP from `X-Forwarded-For`. Limiters: **payment `50 per 15 min per IP`** (`server.js:142-151`) and **API `300 per min per IP`** (`server.js:154-163`). On campus, **thousands of students egress through a handful of NAT public IPs**, so express-rate-limit treats the entire college as one or two clients.

**Math.** One checkout hits `/api/payment/create-order` **and** `/api/payment/verify-payment` (~2 payment requests) → only **~25 checkouts per 15 min for the whole campus behind one egress IP** before everyone gets `429`. The 300/min API budget is shared across menu loads, order polling, and heartbeats for that entire NAT population too.

**Do exactly this (tonight):**
- [ ] 🔴 **Key the limiter on the authenticated user, not the IP,** for logged-in routes, and raise ceilings. `express-rate-limit` v8 (`^8.2.1`) supports a custom `keyGenerator`:
```js
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.headers['x-user-email'] || req.ip, // per-user, not per-NAT
  standardHeaders: true, legacyHeaders: false,
});
```
- [ ] 🔴 If a code change feels risky the night before, the **minimum safe action is to raise the ceilings dramatically** (e.g. payment `max` to several hundred, API `max` to a few thousand) so the campus NAT doesn't trip them. Better still, do both.
- [ ] Ask college IT for the **campus egress public IP range** so you can allowlist/exempt it if needed.
- [ ] Note the heartbeat 429s are non-fatal (`session-guard.js:90-92` skips on non-OK), but **checkout 429s are fatal to a sale** — prioritize the payment limiter fix.

---

### (d) 🟡 Single Node process, cold starts, and static-serving load

**Evidence.** `Dockerfile:23` runs a single `node backend/server.js` (no PM2, no `cluster`, confirmed by grep). `deploy.ps1:81` deploys with **`--min-instances 0 --max-instances 3 --memory 512Mi --cpu 1 --concurrency 80 --timeout 30s`**. That is a hard ceiling of **3 × 80 = 240 concurrent requests**, and **`min-instances 0` means a cold start** on the first login of launch morning (container boot + Redis TLS handshake + Supabase client init) — exactly when a thundering herd logs in at 9am.

Also, the **single process serves ALL static assets** (`server.js:257` `express.static` over the whole repo root) — every PWA image/CSS/JS byte competes with API work on one event loop. And `send-otp` **awaits the SMTP round-trip (1-3s) before responding** (`auth.js:99`), holding a concurrency slot the whole time.

**Do exactly this (for the Cloud Run deployment you are keeping):**
- [ ] 🟡 Redeploy with pre-warmed, higher ceilings before launch:
```powershell
gcloud run deploy spoon-backend --source . --region asia-south1 `
  --min-instances 2 --max-instances 20 --cpu 1 --memory 512Mi `
  --concurrency 60 --timeout 30s --port 7070 --allow-unauthenticated
```
(`min-instances 2` kills cold starts; `max-instances 20` gives real headroom; lower `concurrency` per instance so the single-threaded event loop isn't oversubscribed while awaiting SMTP/DB.)
- [ ] 🟡 Put **Cloudflare (free) in front for static caching** so PWA assets don't ride the Node event loop — big relief for thousands of first loads. (Cloud Run domain mapping alone does not cache.)
- [ ] ⚪ If you later self-host, run **PM2 cluster mode** (`pm2 start backend/server.js -i max`) or multiple container replicas behind a load balancer — but that is not tomorrow's job.

---

### (e) ⚪ Missing web app manifest

Confirmed: **no `manifest.json` anywhere** (glob returned only node_modules loaders). There is a service worker (`sw.js`) but without a manifest the PWA is **not installable / no add-to-home-screen** and Lighthouse PWA checks fail. It still works fully as a website. Ship a minimal manifest post-launch:
```html
<!-- add to <head>
 <meta name="google-adsense-account" content="ca-pub-5996919416931309"> of public pages -->
<link rel="manifest" href="/manifest.json">
```
```json
{ "name": "SPOON Canteen", "short_name": "SPOON", "start_url": "/public/index.html",
  "display": "standalone", "background_color": "#ffffff", "theme_color": "#eb1700",
  "icons": [{ "src": "/public/icon-192.png", "sizes": "192x192", "type": "image/png" },
            { "src": "/public/icon-512.png", "sizes": "512x512", "type": "image/png" }] }
```

---

### (f) 🟡 Monitoring, alerting, uptime, on-call

**Current state.** A health endpoint exists (`/api/health`, `backend/routes/health.js` — checks Redis + Supabase, returns 503 when Redis is down). But there is **no error tracking wired in code** (grep: no Sentry/Datadog/New Relic — only `console.log`/`console.error`), **no uptime ping, no alerting.** The claude.ai Sentry connector shown in this session is **unauthenticated**, so it is not usable here — that must be set up by you in the Sentry dashboard, not via this tool.

**Do exactly this (30 min, do tonight):**
- [ ] 🟡 **Uptime ping + phone alert:** point **UptimeRobot / BetterStack (free)** at `https://spoon.tcetswb.org/api/health` every 1 min; alert to your phone + WhatsApp on the founder number (9152116021 is already the app's support line). Note: health returns 503 when Redis is unhealthy, so this doubles as a Redis alarm.
- [ ] 🟡 **Wire Sentry** (5 lines, `@sentry/node`) so unhandled errors (`server.js:278` global handler currently only `console.error`s) reach a dashboard:
```js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
// in the global error handler: Sentry.captureException(err);
```
Add `SENTRY_DSN` to `.env` **and to the `deploy.ps1` whitelist**.
- [ ] 🟡 **Cloud Monitoring alert** on Cloud Run 5xx rate and instance count == max (early saturation signal).
- [ ] Cloud Run logs → Cloud Logging (retained ~30 days by default); confirm that's acceptable and know where to read them (`gcloud run services logs read spoon-backend --region asia-south1`).
- [ ] Assign a **named on-call human** (you) with a laptop + gcloud access for the launch window.

---

### (g) 🟡 Backups — confirm and TEST a restore

**Free tier has no scheduled backups.** Supabase automated **daily backups are a Pro-tier feature** (7-day retention; PITR is a paid add-on). If you are on free, you have **no recovery path** if data is corrupted on launch day.

**Do exactly this:**
- [ ] 🟡 Confirm **Pro tier** (also required for (b)) and that **daily backups are ON** (Dashboard → Database → Backups).
- [ ] 🟡 **Take a manual pre-launch dump tonight** and store it off Supabase:
```bash
# connection string from Supabase Dashboard → Settings → Database (use the pooler string)
pg_dump "postgresql://postgres:[PWD]@[HOST]:6543/postgres" -Fc -f spoon_prelaunch.dump
```
Also export `users`, `orders`, and the wallet/coins tables to CSV as a belt-and-suspenders copy.
- [ ] 🟡 **Test the restore** into a throwaway Supabase project so you know the dump is valid — an untested backup is not a backup.

---

### (h) 🟡 Load test before launch

**None exists** (glob: no k6/artillery files). Run one tonight, but **do NOT hammer `/api/auth/send-otp`** — it sends real emails (burns the Gmail/relay quota and generates bounces that hurt sender reputation). Load-test the **read/heartbeat paths that are the real bottleneck**, plus a synthetic checkout against **Razorpay TEST keys in a scratch project** (staging was torn down per prior notes; spin a throwaway Cloud Run revision with test keys if you want the full path).

```js
// k6 script: load-test.js — run: k6 run -e BASE=https://spoon.tcetswb.org load-test.js
import http from 'k6/http'; import { sleep } from 'k6';
export const options = { stages: [
  { duration: '2m', target: 200 },   // ramp
  { duration: '5m', target: 1000 },  // sustained ~1k VUs
  { duration: '2m', target: 0 } ] };
const BASE = __ENV.BASE;
export default function () {
  http.get(`${BASE}/api/health`);
  http.get(`${BASE}/api/config`);
  http.get(`${BASE}/public/index.html`);
  // simulate the 15s heartbeat storm (this is your dominant Supabase load):
  http.post(`${BASE}/api/auth/validate-session`,
    JSON.stringify({ email: 'loadtest@example.com', sessionToken: 'x' }),
    { headers: { 'Content-Type': 'application/json' } });
  sleep(1);
}
```
- [ ] Watch p95 latency, Cloud Run instance count (does it hit `max`?), Supabase CPU, and Upstash command count during the run.
- [ ] Confirm you do **not** trip the per-IP API limiter from a single k6 host (it will — which itself demonstrates the NAT problem in (Cross-cutting); temporarily raise limits or exempt the test IP).

---

### (i) 🟡 Rollback plan (rehearse it)

Cloud Run keeps every revision, so rollback is one command — **know it before you need it:**
```powershell
# list revisions, find last-known-good
gcloud run revisions list --service spoon-backend --region asia-south1
# instant 100% rollback
gcloud run services update-traffic spoon-backend --region asia-south1 --to-revisions LAST_GOOD_REVISION=100
```
- [ ] 🟡 **Tag the current known-good revision** and write its name on the launch runbook.
- [ ] 🟡 Keep the DNS TTL low (300s) so you can repoint quickly if a mapping goes wrong.
- [ ] 🟡 Practice the traffic-shift command once tonight against a no-op redeploy so it's muscle memory.

---

### THE BIG DECISION — Same-day institution-server cutover vs. keep Cloud Run

**Recommendation: 🔴 Do NOT cut over to the institution-managed server tomorrow. Keep the already-proven Cloud Run deployment and point the institution DNS/subdomain at it via a Cloud Run domain mapping.** A same-day migration stacks a pile of untested unknowns onto the single highest-traffic day of the app's life, with no rollback rehearsal.

**Why a same-day cutover is the wrong risk (all specific to Spoon):**

| Unknown on the new server | Why it bites Spoon specifically |
|---|---|
| **Outbound SMTP 587** | Institutional firewalls very commonly block outbound port 587 → **OTP emails silently fail → total login outage** (and `send-otp` hard-500s on failure) |
| **Outbound TLS to Upstash 6379 / Supabase 443 / Razorpay 443** | If any is firewalled, OTP store, DB, and payments break |
| **Inbound Razorpay webhook** to `/api/payment/webhook` | A server behind the college firewall/NAT may **not be publicly reachable** → payment reconciliation via the HMAC webhook never arrives |
| **TLS certs for `spoon.tcetswb.org` / `admin.*`** | Must be provisioned and auto-renewing on the new box; Cloud Run does this for free |
| **Process manager / restart-on-crash** | The container runs a single `node` with no PM2/systemd; on a raw server a crash = downtime unless supervised |
| **No load test on the new box** | First real load would be 3,000 students |

Cloud Run already handles TLS, autoscaling, restart-on-crash, and public inbound (webhook works), and an AI pentest already passed against it.

**Safe phased rollout (do this instead):**
- [ ] **Tonight:** apply the 🔴 fixes (email provider, rate-limit keying/ceilings, Upstash paid, Supabase Pro, `min-instances 2`), then redeploy to Cloud Run and smoke-test login + menu + a real ₹1 test order.
- [ ] **Map the institution domain to Cloud Run** (keeps the `spoon.tcetswb.org` brand, zero server migration):
```powershell
gcloud run domain-mappings create --service spoon-backend --domain spoon.tcetswb.org --region asia-south1
# then give college IT the DNS records gcloud prints (A/AAAA or CNAME) to add for spoon.* and admin.spoon.*
```
- [ ] **Soft launch to a slice first** (e.g. one department or first-year batch, a few hundred users) for 1-2 hours; watch UptimeRobot, Cloud Run instance count, Upstash commands, Supabase CPU, and the email send count.
- [ ] **Open to the whole college** only after the slice is green.
- [ ] **Treat the institution-managed server as a Week-2 project**, migrated deliberately with its own load test, firewall verification (outbound SMTP/Redis/Supabase + inbound webhook), TLS, and a rehearsed rollback — never on launch day.

---

### One-page pre-launch checklist (🔴 must clear before opening to the college)

- [ ] 🔴 Email OTP off Gmail → institution relay / Workspace / SendGrid; new keys added to **both** `.env` and `deploy.ps1` whitelist; test OTP delivered from prod.
- [ ] 🔴 Payment + API rate limiters keyed per-user or ceilings raised so campus NAT doesn't get `429`.
- [ ] 🔴 Upstash on Pay-as-you-go; Supabase on Pro (no auto-pause, backups on).
- [ ] 🔴 Cloud Run redeployed with `--min-instances 2 --max-instances 20`; **stay on Cloud Run**, map institution DNS to it.
- [ ] 🟡 Heartbeat interval raised to 60s (`session-guard.js:16`) to cut Supabase load 4×.
- [ ] 🟡 UptimeRobot on `/api/health` → phone alert; Sentry wired; Cloud Monitoring 5xx alert.
- [ ] 🟡 Manual `pg_dump` taken and a restore tested.
- [ ] 🟡 k6 run against read/heartbeat paths passed at target concurrency.
- [ ] 🟡 Rollback command tagged and rehearsed; DNS TTL 300s.
- [ ] 🟡 Soft-launch to a small batch before full college open.

**Files that ground this section:** `backend/services/emailService.js`, `backend/services/redisOtpStore.js`, `backend/services/redisClient.js`, `backend/services/userService.js`, `backend/services/notificationService.js`, `backend/routes/auth.js`, `backend/routes/health.js`, `backend/server.js`, `js/core/session-guard.js`, `Dockerfile`, `deploy.ps1`, `package.json`.
