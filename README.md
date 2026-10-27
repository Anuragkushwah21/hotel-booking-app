# HotelBook

Hotel management app for a single property: room bookings, restaurant table
reservations, add-on services (breakfast, airport pickup/drop, spa…), online
payments, OTP-verified guest booking lookup, and a staff dashboard for the
front desk and admins.

**See [AUDIT.md](AUDIT.md)** for the feature inventory, everything fixed in the
audit, what is still pending, and the deploy checklist.

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Backend:** Next.js route handlers (`app/api`)
- **Database:** PostgreSQL (Neon) via Prisma 7 (`@prisma/adapter-pg`)
- **Auth:** own session cookies (hashed in the DB), bcrypt passwords, email OTP
- **Payments:** Razorpay (UPI / cards / netbanking); a MOCK gateway runs locally without keys
- **Email / messaging:** SMTP via Nodemailer; WhatsApp Cloud API (optional)
- **Hosting:** Vercel (cron in `vercel.json`)

## Local setup

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # fill in DATABASE_URL, SESSION_SECRET, SMTP …
npx prisma migrate deploy   # fresh database: creates everything
npm run prisma:seed         # optional sample data
npm run dev
```

Existing database that was set up with `db push` + `prisma/manual/*.sql`?
Follow **AUDIT.md → Database deploy** instead of `migrate deploy` directly.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm test` | Vitest unit tests in `tests/` |
| `npm run prisma:deploy` | Apply pending migrations |
| `npm run prisma:migrate` | Create a new migration in development |
| `npm run db:studio` | Prisma Studio |

CI (`.github/workflows/ci.yml`) runs validate → typecheck → lint → tests on
every push and pull request.

## Project layout

```
app/(site)/        guest pages: rooms, checkout, booking-status (OTP), invoice …
app/admin/         staff dashboard (HOTEL_MANAGER + ADMIN; some pages ADMIN-only)
app/api/           route handlers; /api/admin/* are role-guarded
lib/booking-engine.ts      availability + booking creation (row-locked transactions)
lib/payment-confirmation.ts payment → auto-confirm, idempotent
lib/pricing.ts             nightly rates, payment rules, GST
lib/otp.ts, lib/rate-limit.ts, lib/security.ts   security primitives
prisma/schema.prisma, prisma/migrations/
tests/             unit tests
```
