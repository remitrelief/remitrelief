![RemitRelief logo](remitrelief-logo.svg)

# RemitRelief

**Disaster-relief microdonations on Stellar** — donors send USDC to verified campaigns; funds sit in a per-campaign Soroban escrow and release only after authorized milestone verification.

## Advanced Campaign Engine (Phase 4)

Campaigns support authenticated draft creation and editing, registered
beneficiaries, optional authorized organization association, controlled
categories/currencies/visibility, deadlines, relational milestones, campaign
updates, media metadata, and stable public slugs.

Public discovery provides bounded search, filtering, sorting, and pagination.
Campaign progress is derived from qualifying verified donation records rather
than client-provided totals. Lifecycle transitions are centralized; owners
submit campaigns while ADMIN users control review, approval, activation,
completion, cancellation after submission, expiry, and closure.

Canonical APIs use `/api/*`. See `docs/CAMPAIGN_API.md`.

## Authentication Persistence (Phase 3)

```text
Wallet connected  ≠  RemitRelief authenticated

Connect wallet
  → POST /auth/challenge
  → Sign message (no on-chain tx)
  → POST /auth/verify
  → User upserted in PostgreSQL (Prisma)
  → Session created (token hashed at rest; HttpOnly cookie)
  → GET /auth/me restores after refresh
  → POST /auth/logout revokes session
```

Roles: `DONOR` · `RECIPIENT` · `NGO` · `ADMIN`
Statuses: `ACTIVE` · `SUSPENDED` · `PENDING` · `DEACTIVATED` (non-ACTIVE cannot use protected APIs)

## Database Setup (Prisma + PostgreSQL)

```bash
cd remitrelief-backend
cp .env.example .env
# Set DATABASE_URL=postgresql://USER:PASS@HOST:5432/remitrelief?schema=public
# Set STORE_DRIVER=prisma

npm install
npm run prisma:generate
npm run prisma:migrate      # applies prisma/migrations/*
npm run prisma:seed         # development seed only (refuses production)
npm run dev
```

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | **Required in production** |
| `STORE_DRIVER` | `prisma` / `postgres` for DB; `json` only for local tests without Postgres |
| Production | `STORE_DRIVER=json` is **rejected** |

Architecture:

```text
Frontend → API → Middleware → Services → Repositories → Prisma → PostgreSQL
Services → Blockchain adapter → Soroban (testnet)
```

PostgreSQL stores users, sessions, audits, campaigns, donations, ledger events, and blockchain **metadata**. On-chain truth still comes from Soroban verification — a DB row is never proof of a chain tx by itself.

Serverless note: Prisma client is a process singleton (`src/database/prisma.js`). Use a pooled `DATABASE_URL` (e.g. Neon pooler) on Vercel.

## Auth API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/challenge` | Rate-limited |
| POST | `/auth/verify` | Sets session cookie |
| GET | `/auth/me` | `{ user, sessionId, expiresAt }` |
| POST | `/auth/logout` | Revokes DB session |

## Quick start (JSON offline / tests)

```bash
cd remitrelief-backend
# STORE_DRIVER=json (default when DATABASE_URL unset)
npm install && npm test && npm run dev

cd ../remitrelief-frontend && npm install && npm run dev
```

## Tests / build

```bash
cd remitrelief-backend && npm test && npm run prisma:validate
cd ../remitrelief-frontend && npm run build
```

## Status

Testnet only. Not audited. Do not use with real funds.

## License

MIT
