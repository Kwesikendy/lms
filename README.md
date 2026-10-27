# Aether LMS — Glassmorphism Learning Management System

A production-grade, single-organization Learning Management System (LMS) built with a three-layer midnight glassmorphism design system, Ghana-first payments (**Paystack** & **Hubtel** Mobile Money and Cards), protected course & digital library entitlements, and a dedicated **LiveKit** interactive WebRTC classroom.

---

## 1. Architecture & Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Lucide Icons, `livekit-client` (official LiveKit WebRTC Client SDK).
- **Backend**: Node.js + Express 5 REST API (`src/server/`), `livekit-server-sdk` (official LiveKit Server SDK for short-lived token generation, room lifecycle, Egress recording, and webhook signature verification), `zod` schema validation, `helmet` security headers, and `express-rate-limit`.
- **Database**:
  - Normalized relational SQL schema with ACID transactions (`withTransaction`).
  - **Production**: PostgreSQL (`migrations/001_initial_schema.postgres.sql`).
  - **Local & Automated Testing**: Native Node.js `node:sqlite` (`migrations/001_initial_schema.sqlite.sql`) with `PRAGMA foreign_keys = ON` and WAL journaling at `./data/lms.sqlite`.
- **Payments & Entitlements**:
  - Server-calculated order totals (`orders`, `order_items`, `payment_attempts`).
  - **Paystack** (`HMAC-SHA512`) and **Hubtel** (`HMAC-SHA256`) webhook verification with idempotent event deduplication (`payment_events` unique constraint on `(provider, event_id)`), amount validation, and atomic entitlement activation (`entitlements`).

---

## 2. Quick Start & Local Development

### Prerequisites
- **Node.js**: `v22.5+` or `v24+` (uses native `node:sqlite` and modern ES modules)
- **npm**: `v10+`

### Installation
```bash
# 1. Install dependencies
npm install

# 2. Copy environment configuration
cp .env.example .env

# 3. Seed the local relational database (also runs automatically on server startup if empty)
npm run db:seed

# 4. Start the full-stack development server (Express API + Vite HMR)
npm run dev
```
The application will be available at `http://localhost:3001`.

### Seeded Development Accounts (Development & Test Fixtures Only)
All seeded accounts use the password `Password123!`:
- **Student**: `kofi.student@aetheracademy.edu.gh`
- **Instructor**: `kwame.asante@aetheracademy.edu.gh`
- **Administrator**: `admin@aetheracademy.edu.gh`

---

## 3. External Credentials & Integration Setup

### A. LiveKit Classroom (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- **What is implemented now**:
  - Server-side session authorization (`POST /api/livekit/sessions/:sessionId/join`), course entitlement verification, role mapping (`instructor` / `moderator` / `student`), short-lived JWT generation via `livekit-server-sdk` (`AccessToken`), attendance tracking (`session_attendance`), session state machine (`scheduled` → `live` → `ended` | `canceled`), webhook receiver (`POST /api/livekit/webhook`), Egress recording API (`POST /api/livekit/sessions/:sessionId/recording`), and the full multi-panel WebRTC classroom UI (`LiveClassroomPage.tsx`).
- **What requires external credentials**:
  - Real multi-peer WebRTC media routing through a LiveKit SFU and server-side Egress MP4 recording require a LiveKit Cloud project or self-hosted LiveKit + Egress deployment.
  - Set `LIVEKIT_URL=wss://your-project.livekit.cloud`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env`.
  - For server-side recording, deploy LiveKit Egress and set `LIVEKIT_EGRESS_ENABLED=true`.

### B. Paystack & Hubtel Payments (`PAYSTACK_SECRET_KEY`, `HUBTEL_CLIENT_ID`, etc.)
- **What is implemented now**:
  - Server-side order creation (`POST /api/payments/checkout`), live API initialization when keys are present, cryptographic webhook signature verification (`POST /api/payments/webhook/paystack` and `POST /api/payments/webhook/hubtel`), idempotency protection, amount verification, entitlement granting (`course`, `resource`, `bundle`), and administrative refunds (`POST /api/admin/orders/:orderId/refund`) with automatic entitlement revocation.
  - When live keys are not set in `.env` (in `development` / `test`), `/checkout/result` provides a **Signed Webhook Verification Harness** (`POST /api/payments/sandbox/dispatch-signed-webhook`) that computes a real HMAC signature and dispatches the payload through the server's webhook processor.
- **What requires external credentials**:
  - Live Mobile Money prompts (MTN MoMo, Telecel Cash, AirtelTigo Money) and live card settlements require setting `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` (or Hubtel equivalents) in `.env` and registering `<APP_BASE_URL>/api/payments/webhook/paystack` in the Paystack dashboard.

---

## 4. Testing & Quality Assurance

Run the automated test suite and production build verification:
```bash
# Run automated integration, security, payment webhook, and LiveKit tests
npm test

# Build production client bundle and verify TypeScript compilation
npm run build
```

---

## 5. Production Deployment & Backup Checklist

- [ ] Set `NODE_ENV=production` and configure `APP_BASE_URL` to your HTTPS domain.
- [ ] Generate cryptographically strong 64-byte hex secrets for `SESSION_SECRET` and `MEDIA_SIGNING_SECRET`.
- [ ] Apply `migrations/001_initial_schema.postgres.sql` to your production PostgreSQL instance (or configure volume-backed SQLite WAL backups).
- [ ] Configure `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` and register the webhook URL.
- [ ] Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` and register `<APP_BASE_URL>/api/livekit/webhook`.
- [ ] Schedule automated daily database backups (PostgreSQL `pg_dump` or SQLite `.backup` API) and private storage bucket replication (`uploads/` or S3 versioning).
