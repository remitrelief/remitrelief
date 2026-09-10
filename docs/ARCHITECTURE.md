# RemitRelief Architecture (Phase 4)

```text
React Frontend (WalletContext + AuthContext)
        │
        ▼
Express API (helmet, CORS allowlist, cookies)
        │
        ▼
Auth + Authorization middleware
        │
        ▼
Controllers → Domain services (lifecycle, validation, authorization, progress)
        │
        ├──────────────────────┐
        ▼                      ▼
Repositories              Blockchain / Soroban
        │                      │
        ▼                      ▼
Prisma Client              Stellar TESTNET
        │
        ▼
PostgreSQL
```

## Persistence rules

- **Production:** Prisma → PostgreSQL only (`DATABASE_URL` required).
- **Local tests without DB:** `STORE_DRIVER=json` uses `src/data/store.js` fixtures only.
- Never silently fall back from Postgres to JSON when Postgres was configured.

## Campaign domain

Campaign routes use the canonical `/api/campaigns` namespace. Controllers remain
thin and delegate to services, which enforce ownership, organization membership,
state transitions, editability, and visibility before repositories run.

```text
Route → Controller → Campaign Service → Repository → Prisma → PostgreSQL
                         │
                         ├── lifecycle transition matrix
                         ├── validation and decimal-string money rules
                         ├── owner / organization / ADMIN authorization
                         └── audit records
```

Relational milestones are authoritative. Campaign updates and media are separate
records. Public discovery loads bounded pages and donation aggregates rather
than every donation or audit record.

Public campaign progress counts only qualifying `ON_CHAIN` donations marked as
verified. Demo/application donations remain identifiable and are not presented
as verified funds.

## Auth

Wallet signature proves ownership. Sessions are server-side rows; cookie carries an opaque token; DB stores **SHA-256 hash** only.

## Blockchain vs database

PostgreSQL may store transaction hashes and ledger events. Confirmation of on-chain success remains the Soroban verification path in `src/blockchain/soroban/`.
