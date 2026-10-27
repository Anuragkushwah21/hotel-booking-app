# Project Audit & Fix Log

> Ye file project ka **living audit record** hai: project me kya-kya hai, kya fix hua,
> kya abhi bhi pending hai, aur deploy kaise karna hai. Har naye fix ke baad
> "Fix log" aur "Pending" section update karte rehna.

| | |
|---|---|
| Last updated | 2026-10-25 |
| Branch | `audit-fixes` (commit nahi hua — review ke baad merge karo) |
| Readiness (audit se pehle) | 5 / 10 |
| Readiness (ab) | ~7.5 / 10 — security blockers band; staging pe manual test + monitoring baaki |
| Dev DB (Neon) | migrations `0_init` + `1_audit_fixes` applied ✅ (2026-10-25), schema drift: none |
| Checks | `tsc` ✅ · `eslint` 0 errors (73 purani warnings) · `vitest` 27/27 ✅ · `next build` ✅ |
| Browser testing | ❌ Abhi nahi hua — neeche "Manual QA checklist" follow karo |

---

## 1. Project me kya-kya hai (feature inventory)

Legend: ✅ hai · 🟡 partial · ❌ nahi hai · 🆕 is audit me bana / theek hua

### Guest side

| Feature | Status | Kahan |
|---|---|---|
| Homepage, gallery, services page | ✅ | `app/(site)/page.tsx`, `gallery`, `services` |
| Room listing + details + date-wise availability | ✅ | `app/(site)/rooms/*`, `api/rooms/available` |
| Room booking (guest checkout, login optional) | ✅ | `api/bookings/rooms`, `checkout` |
| Nightly pricing (weekend / peak season / event dates) | ✅ | `lib/pricing.ts` |
| GST — flat **ya** India slab mode (room tariff slab, table, add-ons alag rate) | 🆕 | `lib/pricing.ts` (`taxForStay`) |
| Payment rules (advance %, same-day full, premium dates, long stay) | ✅ | `lib/pricing.ts` |
| Table booking, party size, 2-hour slots | ✅ | `api/bookings/tables` |
| Restaurant seating hours enforce (open → last seating) | 🆕 | `lib/booking-engine.ts` (`assertTableSlotBookable`) |
| Past date / past slot booking block | 🆕 | `lib/booking-engine.ts` |
| Room + table combined (table na mile to room phir bhi book) | ✅ | `createRoomBooking` → `tableSkipped` |
| Add-ons: breakfast, pickup, drop, spa, extra bed, late checkout | ✅ | `ADD_ONS` in `lib/booking-engine.ts` |
| Pickup/drop details (flight/train no., time, location, passengers) | 🆕 | `components/site/transfer-details.tsx`, `lib/transfers.ts` |
| Razorpay payment + webhook + auto-confirm (idempotent) | ✅ | `lib/payment-confirmation.ts` |
| My Bookings (logged-in) | ✅ | `app/(site)/bookings` |
| **Booking lookup — ab sirf OTP verify ke baad** | 🆕 | `booking-status`, `api/bookings/lookup` + `/verify` |
| Cancel + tiered refund policy | ✅ | `lib/cancellation.ts` |
| GST invoice (sequential number, SAC, CGST/SGST, print/PDF) | 🆕 | `app/(site)/invoice/[id]`, `lib/invoice.ts` |
| Signup + email OTP verification | ✅ (🆕 secure) | `api/auth/*`, `lib/otp.ts` |
| Forgot / reset password | 🆕 | `forgot-password`, `reset-password`, `api/auth/*-password` |
| Reviews (checkout ke baad) | ✅ | `api/reviews` |
| WhatsApp support button | 🆕 | `components/site/whatsapp-button.tsx` |
| Coupons / discounts | ❌ | — |

### Admin side

| Feature | Status | Kahan |
|---|---|---|
| Roles: HOTEL_MANAGER, ADMIN (admin-only pages nav me chhupe + server pe guard) | ✅ | `lib/auth.ts`, `lib/admin-guard.ts`, `admin-shell.tsx` |
| Dashboard | ✅ | `app/admin/page.tsx` |
| Booking list + filters (status, payment, refund, add-on, upcoming pickups) | ✅ 🆕 | `app/admin/bookings` |
| Booking detail drawer: ledger, desk payment, cancel+refund override, no-show, room move, pickup/drop, invoice | 🆕 | `components/admin/bookings/booking-detail-drawer.tsx` |
| Walk-in booking | ✅ | `app/admin/bookings/new` |
| Check-in / check-out (balance due pe rokta hai) | ✅ | `api/admin/bookings/[id]/status` |
| No-show status | 🆕 | same route, `NO_SHOW` |
| Room transfer (locked, availability re-check) | 🆕 | `api/admin/bookings/[id]/transfer` |
| Pickup/drop management (driver, phone, vehicle, status) | 🆕 | `api/admin/bookings/[id]/transfers`, `transfer-legs.tsx` |
| Payments & refunds page (refund queue + ledger) | 🆕 | `app/admin/payments` |
| Rooms, tables CRUD | ✅ | `app/admin/rooms`, `app/admin/tables` |
| Housekeeping board (CLEAN/DIRTY/IN_PROGRESS/INSPECTED; checkout → DIRTY auto) | 🆕 | `app/admin/rooms`, `api/admin/room/[roomId]/housekeeping` |
| Room date blocks (maintenance) UI | 🆕 | `components/admin/rooms/room-blocks-dialog.tsx` |
| Rates & seasons (room rates, peak seasons, event dates) | 🆕 | `app/admin/pricing` |
| Hotel settings (advance, GST mode, GSTIN, restaurant hours, refund policy) | 🆕 | `app/admin/settings` |
| Users & staff (invite, role, deactivate, resend invite) | 🆕 | `app/admin/users`, `api/admin/users/*` |
| Reports: occupancy, ADR, RevPAR, source-wise, add-on, no-show, CSV | 🆕 | `app/admin/analytics`, `lib/admin-stats.ts` |
| Audit trail of staff actions | ✅ | `ManagerAction`, `lib/manager-log.ts` |
| Notification log (email + WhatsApp) + retry | ✅ 🆕 | `lib/notifications.ts`, `lib/jobs.ts` |
| Room types as a separate model | ❌ | pending (Section 3) |
| Guest folio / extra charges during stay | 🟡 | desk payment hai; itemised folio charges nahi |
| Driver / vehicle master list | 🟡 | per-booking free text; master table nahi |
| Complaints / maintenance tickets | ❌ | — |
| Coupons, OTA, multi-property | ❌ | — |

---

## 2. Fix log

Har item: **problem → fix → files**. Severity audit report wali hai.

### 🔴 C1 — Booking lookup bina OTP ke PII leak karta tha
- **Problem:** `/api/bookings/lookup` me koi bhi kisi ka email ya phone daal ke uski 20 bookings dekh sakta tha (naam, phone, dates, amount).
- **Fix:** ab 2 steps hain.
  1. `POST /api/bookings/lookup {query}`: booking data **kabhi return nahi hota**. 6-digit code **booking pe saved email** pe jata hai, typed email pe nahi. Response me sirf masked hint aata hai, jaise `ra***@gmail.com`.
  2. `POST /api/bookings/lookup/verify {query, code}`: code sahi ho tabhi bookings milti hain, aur har booking ke liye signed access cookie set hoti hai (cancel / pay / invoice ke liye).
  - OTP subject (ref / email / phone) se bound hai, isliye ek booking ka code dusri nahi kholta.
  - Purana in-memory limiter hata ke DB-backed rate limit lagaya.
- **Files:** `lib/booking-lookup.ts`, `app/api/bookings/lookup/route.ts`, `app/api/bookings/lookup/verify/route.ts`, `app/(site)/booking-status/page.tsx`, `components/site/otp-input.tsx`
- **Test:** `tests/lookup.test.ts`, `tests/otp.test.ts`

### 🔴 C2 — OTP system weak tha
- **Problem:**
  - plaintext code store hota tha
  - `Math.random` se banta tha
  - galat attempts ki koi limit nahi thi (brute-force possible)
  - resend ki koi limit nahi thi
  - `code @unique` ki wajah se do users ko same code milne pe signup fail hota
- **Fix (`lib/otp.ts`):**
  - `crypto.randomInt` se code banta hai
  - DB me sirf HMAC store hota hai
  - har galat attempt count hota hai, 5 pe lock (`OTP_MAX_ATTEMPTS`)
  - code single-use hai, aur naya code purane ko void kar deta hai
  - resend pe 60 second cooldown, aur ek subject ke liye 5 codes per ghanta
  - `purpose` field (EMAIL_VERIFY / BOOKING_LOOKUP)
  - email templates me naam HTML-escape hota hai
- **Files:** `lib/otp.ts`, `lib/email.ts`, `app/api/auth/verify-otp`, `app/api/auth/resend-otp`, `prisma/schema.prisma` (`OTPCode`)

### 🟠 C3 — Rate limiting nahi tha
- **Fix:** `lib/rate-limit.ts`: Postgres `RateLimit` table, ek atomic upsert, saare serverless instances pe kaam karta hai. DB down ho to fail-open (login band nahi hoga). Limits:

| Endpoint | Limit |
|---|---|
| login | 20 / IP / 15 min, 8 / email / 15 min |
| signup | 10 / IP / ghanta |
| verify-otp | 30 / IP / 15 min |
| resend-otp | 10 / IP / ghanta |
| booking lookup | 10 / IP / 10 min |
| lookup verify | 20 / IP / 15 min |
| forgot-password | 10 / IP + 3 / email per ghanta |
| reset-password | 20 / IP / ghanta |
| staff invite resend | 5 / user / ghanta |

### 🟠 Login / session hardening
- Login ab email ko lowercase karta hai. Pehle signup lowercase karta tha aur login nahi, isliye capital letters wala email login nahi hota tha.
- Login deactivated account ko block karta hai. Unknown email pe bhi dummy bcrypt compare hota hai, taaki response timing se pata na chale ki email registered hai ya nahi.
- Session token DB me **SHA-256 hash** ke roop me store hota hai.
- Staff session 12 ghante ka hai, guest session 30 din ka.
- Password reset, role change aur deactivation pe us user ke saare sessions revoke hote hain.
- bcrypt cost 10 se 12 kiya.
- `/api/auth/me` deactivated user ko null deta hai.
- Auth logs se email (PII) hataya.
- **Files:** `lib/auth.ts`, `app/api/auth/login`, `signup`, `me`

### 🟠 Forgot password link toota tha
- Email `/reset-password` pe bhejta tha, jo page exist nahi karta tha.
- **Fix:** ab forgot / reset ka pura flow hai: hashed single-use token, 1 ghante expiry, response same chahe email registered ho ya nahi. Staff invites bhi yahi link use karte hain (72 ghante expiry).
- **Files:** `app/api/auth/forgot-password`, `reset-password`, `app/(site)/forgot-password`, `reset-password`, `login` (link)

### 🟠 Secrets
- Booking-access HMAC key pehle `DATABASE_URL` pe fallback karti thi.
- **Fix:** ab `lib/security.ts → serverSecret()` sab jagah ek hi key deta hai. Production me `SESSION_SECRET` (32+ characters) ke bina app signing se mana kar deti hai. Local `.env` me `SESSION_SECRET` aur `CRON_SECRET` generate karke add kiye hain.
- `.env.example` saaf kiya. Unused `next-auth` aur `stripe` packages hata diye.

### 🔴 C4 — Admin UI missing tha (backend APIs bane the, pages nahi)
- **Naye pages:** `/admin/settings`, `/admin/pricing`, `/admin/payments`, `/admin/users`
- **Existing pages me add kiya:** booking detail drawer, housekeeping, room blocks
- **Sidebar:** links add kiye. ADMIN-only items manager ko nahi dikhte (`adminOnly`), aur page server pe bhi `requireAdminPage()` se guarded hai.
- **Naye APIs:**
  - `POST /api/admin/users` (invite)
  - `PATCH /api/admin/users/[id]` — khud ko demote/deactivate nahi kar sakte, aur last admin protect hota hai
  - `POST /api/admin/users/[id]/invite`
  - `GET /api/admin/users?role=STAFF`

### 🔴 C5 — Migrations nahi the
- **Fix:** `prisma/migrations/0_init` banaya, jo purane schema (db push + manual 001–004) ka baseline hai, `generate_booking_ref()` ke saath. Saath me `1_audit_fixes` banaya, jisme saare naye columns, tables aur enums hain.
- `prisma/manual/` ab sirf history ke liye hai.
- Deploy ke steps neeche Section 4 me hain.

### 🟠 C6 — Booking edit me race condition
- Admin PATCH availability check aur write ke beech lock nahi leta tha.
- **Fix:** final write ab transaction ke andar hota hai, booking engine wale `FOR UPDATE` room lock ke saath, aur availability dobara check hoti hai. `NO_SHOW` booking edit nahi ho sakti. Recompute hone pe `taxBreakdown` bhi update hota hai.
- **File:** `app/api/admin/bookings/[id]/route.ts`

### 🟠 C7 — Timezone bug
- `nightsBetween` / `startOfDay` server ka timezone use karte the (Vercel pe UTC).
- **Fix:** ab IST calendar (`dateKey`) use hota hai.
- **Files:** `lib/booking-engine.ts`
- **Test:** `tests/dates.test.ts`

### 🟠 C8 — GST + invoice
- **GST:** `taxMode` setting add ki.
  - `FLAT` (default — purana behaviour, existing prices nahi badlengi)
  - `INDIA_SLABS`: room night tariff ≤ threshold pe low rate, upar high rate; table aur add-ons apne rates pe
  - Rates admin settings me hain, hard-coded nahi. **CA se confirm karo.**
- Har booking pe `taxBreakdown` save hota hai.
- **Invoice:**
  - Number format `INV/2026-27/000001` — per financial year sequential, row lock ke saath
  - SAC codes, CGST/SGST split, payments aur refunds, print/PDF
  - Access sirf owner, staff, ya OTP-verified guest ko
  - GSTIN aur legal name settings se aate hain
- **Files:** `lib/pricing.ts`, `lib/invoice.ts`, `app/(site)/invoice/[id]`, `components/site/price-summary.tsx`, `lib/validation.ts` (`settingsSchema`)
- **Test:** `tests/pricing.test.ts`

### 🟡 C9 — Background jobs
- **Fix:** `GET /api/cron/maintenance` (`CRON_SECRET` Bearer token se protected) + `vercel.json` cron. Ye job:
  - expired holds release karta hai
  - failed/pending notifications ko retry karta hai
  - kal check-in wale guests ko reminder bhejta hai (ek booking pe ek baar)
  - purane OTP aur rate-limit rows saaf karta hai
- **Files:** `lib/jobs.ts`, `app/api/cron/maintenance/route.ts`, `vercel.json`
- ⚠️ Vercel Hobby plan pe cron din me 1 baar hi chalta hai (`30 0 * * *` UTC = 06:00 IST). Pro plan pe frequency badha sakte ho. Inventory iske bina bhi sahi rehti hai — holds query level pe expire hote hain.

### 🟡 C10 — Refund atomic nahi tha
- **Fix (`lib/cancellation.ts → processRefund`):**
  1. Booking row lock ke andar refund rows `CREATED` status me reserve hoti hain. Agar ek refund pehle se chal raha hai to doosra 409 deta hai — isliye double click se double refund nahi hota.
  2. Gateway call hoti hai; har slice `SUCCEEDED` ya `FAILED` mark hota hai.
  3. Sab succeed ho tabhi booking settle hoti hai.
- Refund ab kai online payments me split hota hai (advance + balance). Jo hissa desk pe pay hua tha wo desk refund ke roop me record hota hai.
- Fail hone pe booking `REFUND_PENDING` hi rehti hai, saath me reason, aur retry ho sakta hai.

### 🟡 C12 — Security headers / CSRF
- **Headers** (`next.config.mjs`): X-Frame-Options DENY, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, HSTS, `poweredByHeader: false`. Booking aur admin pages pe `no-store`.
- **CSRF** (`proxy.ts`): kisi doosri site ke Origin se aaya hua `/api` POST/PATCH/DELETE request 403 hota hai. Webhook aur cron pe Origin header nahi hota, isliye unhe allow kiya hai — wo apne signature se verify hote hain.

### 🟠 C13 — Testing / lint / CI
- Vitest: 27 tests (pricing/GST, refund policy, IST dates, lookup parsing, OTP rules, security helpers, transfers).
- ESLint 9 flat config (`eslint.config.mjs`) + `eslint-config-next`. 4 errors fix kiye.
- GitHub Actions: `.github/workflows/ci.yml` (validate → typecheck → lint → test).
- Naye scripts: `typecheck`, `test`, `prisma:deploy`, `postinstall` (prisma generate).

### Naye features (audit ke "missing" list se)
- NO_SHOW status: sirf check-in time ke baad allowed, inventory release hoti hai, policy ke hisaab se refund nahi
- Room transfer
- Pickup/drop details (guest checkout pe + staff assignment)
- Housekeeping status
- Restaurant hours
- Staff invite
- WhatsApp button
- Reports me ADR, RevPAR aur source-wise breakdown
- Check-in reminders

### Dashboard crash (2026-10-25)
- **Problem:** `/admin` page crash ho raha tha: `Cannot read properties of undefined (reading 'toLocaleString')`. Page "Revenue today" tile ke liye `onlineRevenueToday` aur `walkInRevenueToday` padhta tha, jo dashboard API kabhi bhejti hi nahi thi (bug audit se pehle ka tha).
- **Fix:** API ab aaj ka net revenue (payments minus refunds) Online / Walk-in me split karke bhejti hai. `inr()` formatter ab missing value ko ₹0 dikhata hai, crash nahi karta.
- **Files:** `app/api/admin/dashboard/route.ts`, `components/admin/ui.tsx`

### Cleanup
- Unused legacy routes hataye: `api/bookings/rooms/[roomId]`, `api/bookings/tables/[tableId]`, `GET /api/bookings`. Inme ownership check tha, lekin UI kahin use nahi karta tha.
- `api/rooms/[roomId]` se debug `console.log` hataye.
- `pnpm-lock.yaml` hataya. Project npm use karta hai (`package-lock.json` hi asli lockfile tha).
- README dobara likha. Usme Stripe ka purana mention galat tha.
- `lib/hotel.ts` me "Free cancellation up to 24 hours" likha tha jo actual refund policy se mismatch tha; ab ye neutral text hai.

---

## 3. Pending — abhi bhi kya baaki hai

| # | Item | Priority | Kyun / note |
|---|---|---|---|
| 1 | **Staging pe migration + browser QA** | P0 | Code compile/test pass hai, lekin koi page browser me nahi chalaya. Section 5 checklist |
| 2 | Error monitoring (Sentry) + uptime alerts | P0 | Account / DSN chahiye — tumhe setup karna hoga |
| 3 | DB backups / staging DB | P0 | Neon branch ya PITR enable karo, migration se pehle branch lo |
| 4 | GST rates CA se verify karo, phir `INDIA_SLABS` on karo | P0 | Restaurant "specified premises" rule implement nahi hai |
| 5 | `RoomType` model (type book ho, room check-in pe assign) | P1 | Bada refactor: inventory + pricing + listing |
| 6 | Full Content-Security-Policy (script-src) | P1 | Razorpay + photo hosts ka allow-list chahiye |
| 7 | OTP SMS / WhatsApp pe bhi | P1 | Abhi sirf email. Phone se lookup karne pe code booking ke email pe jata hai |
| 8 | Integration / E2E tests (real Postgres, Playwright) | P1 | Abhi sirf unit tests; booking lock aur payment flow DB ke saath test nahi hue |
| 9 | Guest folio (itemised charges during stay) | P1 | |
| 10 | Driver / vehicle master data + assignment board | P2 | Abhi per-leg free text |
| 11 | Coupons / discounts | P2 | |
| 12 | Admin-editable add-on catalogue | P2 | Abhi `ADD_ONS` code me hai |
| 13 | Image upload (Cloudinary) + `next/image` optimisation | P2 | `images.unoptimized: true`. `.env` me Cloudinary keys pade hain, code use nahi karta |
| 14 | Availability calendar UI, notification template editor, complaints | P2 | |
| 15 | `api/bookings/room-table` legacy route → `/api/bookings/rooms` + `table` pe shift | P3 | `bookings/room-table` page abhi use karta hai |
| 16 | Unused schema: `RoomAvailability` model, `RoomStatus.BOOKED` | P3 | Data check karke drop karo |
| 17 | 73 ESLint warnings (mostly `any`, unused vars, effects) | P3 | |
| 18 | OTA / channel manager, multi-property | P3 | |

---

## 4. Deploy checklist

### Environment variables (Vercel → Settings → Environment Variables)
- `SESSION_SECRET`: **required**, 32+ random characters. Iske bina production me booking access, OTP aur sessions fail honge.
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `CRON_SECRET`: required for the cron.
- `DIRECT_URL`: Neon ka **non-pooled** URL (host me `-pooler` nahi). Prisma CLI (`migrate`, `studio`) isi se chalti hai. Pooler pe migrate chalane se advisory lock atak jata hai aur `P1002` error aata hai (dev DB pe 2026-10-25 ko yahi hua tha). Na ho to `prisma.config.ts` khud `-pooler` hata ke use karta hai.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- SMTP: `EMAIL_USER`, `EMAIL_PASSWORD`, `SMTP_*`, `SMTP_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL`: asli domain. Reset links aur CSRF origin check isi pe depend karte hain.
- Optional: `NEXT_PUBLIC_WHATSAPP_NUMBER`, `WHATSAPP_*`
- Hata sakte ho (code use nahi karta): `NEXTAUTH_*`, `JWT_*`, `CLOUDINARY_CLINT_*` (jab tak image upload nahi banta)

### Database deploy

**Existing database** (jo `db push` + `prisma/manual/001–004` se bana tha):

```bash
# 0. Backup: Neon console me branch / snapshot banao
# 1. Baseline mark karo (0_init dobara NAHI chalega)
npx prisma migrate resolve --applied 0_init
# 2. Naye changes apply karo
npx prisma migrate deploy
```

**Agar galti se pehle `migrate deploy` chal gaya aur `P3009 … 0_init failed` aaye**
(error: `type "UserRole" already exists`): ghabrao mat, kuch apply nahi hua hota,
kyunki migration pehle hi statement pe ruk jati hai. Pehle check karo ki DB purane schema se match karta hai
(`npx prisma migrate diff --from-config-datasource --to-schema <purana schema.prisma> --script` ka output
"empty migration" hona chahiye), phir upar wale step 1 aur 2 chalao. Dev DB (Neon) pe 2026-10-25 ko
yahi hua tha aur isi tarah fix hua.

**Fresh database:**

```bash
npx prisma migrate deploy
```

⚠️ `1_audit_fixes` ye teen tables saaf karta hai: `OTPCode`, `PasswordResetToken`, `Session`. Iska matlab:
- **Sab users ko ek baar dobara login karna padega**
- Pending OTP aur reset links bekaar ho jayenge

Ye jaan-boojh ke kiya hai, kyunki in tables ka format ab hashed hai.

### Doosre settings
- **Razorpay webhook:** `{APP_URL}/api/payments/webhook`, events `payment.captured` aur `payment.failed`
- **Admin → Settings me bharo:** GSTIN, legal name, tax mode, restaurant hours
- **Staff:** Admin → Users se invite karo (seed ke bajaye)

---

## 5. Manual QA checklist (staging pe)

- [ ] `/booking-status`
  - [ ] booking number daalo → booking wale email pe code aaye → code daalo → booking dikhe
  - [ ] galat code 5 baar daalne pe lock ho jaye
  - [ ] resend button 60 second baad hi enable ho
- [ ] Kisi ka phone number daalne pe code **booking ke email** pe jaye, aur screen pe sirf masked hint dikhe
- [ ] Signup → OTP → login. Email capital letters me type karke bhi login ho
- [ ] Forgot password → email link → naya password → purane sessions logout ho jayein
- [ ] Room booking with airport pickup → checkout pe flight details maange → admin drawer me dikhe → driver assign karo
- [ ] Table booking: restaurant hours ke bahar ka time reject ho, aur beete hue time ka slot bhi
- [ ] Razorpay test payment → booking confirm ho → invoice khule, number `INV/…/000001` ho
- [ ] Cancel → Admin → Payments → refund process ho → Razorpay dashboard me refund dikhe; double click pe sirf ek refund bane
- [ ] No-show: check-in se pehle disabled ho, baad me kaam kare
- [ ] Room transfer: occupied room pe 409 aaye
- [ ] Checkout karne pe room DIRTY ho jaye
- [ ] Manager login: Settings / Pricing / Payments / Users / Reports nav me na dikhein, aur URL seedha kholne pe redirect ho
- [ ] Staff invite email → set password → login
- [ ] Reports: ADR / RevPAR numbers ek chhote date range pe haath se cross-check karo
- [ ] Cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/maintenance`
