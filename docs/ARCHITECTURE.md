# RemitRelief Architecture (Phase 5)

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
Controllers → Domain services (lifecycle, escrow bind, donations, milestones)
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
                         ├── escrow bind (pre-deployed TESTNET address)
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

## Escrow binding (Phase 5)

Admins bind a pre-deployed TESTNET escrow contract ID to an `APPROVED` campaign
(`POST /api/campaigns/:id/escrow`). Activation outside `DEMO_MODE` requires that
binding. The app does **not** deploy or initialize new escrow instances in this
phase.

Donation prepare/record use the **server-side** `campaign.escrowAddress` only.
Client-supplied escrow addresses are ignored.

## Auth

Wallet signature proves ownership. Sessions are server-side rows; cookie carries an opaque token; DB stores **SHA-256 hash** only.

## Blockchain vs database

PostgreSQL may store transaction hashes, ledger events, and
`BlockchainTransaction.contractAddress` for deposits. Confirmation of on-chain
success remains the Soroban verification path in `src/blockchain/soroban/`.
