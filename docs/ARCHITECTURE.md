# RemitRelief Architecture (Phase 12)

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
Controllers → Domain services (lifecycle, escrow, donations, milestones, orgs, admin)
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

## Proof & release (Phase 6)

NGO/ADMIN submit `MilestoneProof` records (plain-text note + optional evidence
URLs). Verification requires an ACTIVE campaign and a prior proof. Release is a
separate privileged step (`autoRelease` defaults off). The indexer may sync
relational milestone flags from on-chain verify/release events when a milestone
index is present.

## Operator workspaces (Phase 7)

ADMIN users get a moderation queue, organization status approvals (not KYC),
audit feed, and indexer status. Organizers create organizations and attach
**VERIFIED** orgs to campaigns. Public ledger supports `campaignId` filtering;
campaign detail surfaces proofs and activity.

## Indexer & transparency (Phase 8)

The light indexer walks **all pages** of Soroban contract events for each bound
escrow (bounded by `maxPages`), optionally **backfills** by clearing cursors,
persists a last-run summary, and can be triggered by ADMIN or the internal cron
key. Ledger listing is paginated and separates on-chain-verified events from
demo/application events. Indexed amounts and milestone indexes are parsed from
contract event topics/data when present.

## KYC-lite verification (Phase 9)

Users carry a `verificationStatus` (stored on `Profile` in Prisma, on the user
row in the JSON store). Applicants request the NGO or RECIPIENT role with a
statement and optional evidence URLs; ADMIN approves or rejects from a queue.
Approval grants the role and sets `VERIFIED`. `assertActorVerified` gates proof
submission and milestone verification for non-admin actors. This is an
application status gate only — no identity documents are collected or stored.

## Demo readiness (Phase 10)

The frontend loads the Stellar wallet kit and SDK lazily (`WalletContext`
dynamic-imports `lib/wallet.js`), so the initial bundle carries only the app
shell. Admins can suspend or reinstate users by wallet. All state-changing
routers share `createMutationLimiter` (`src/middleware/rateLimit.js`).
`test/demo-walkthrough.test.js` exercises the full demo story through the HTTP
API.

## Notifications & dashboards (Phase 11)

`notificationsService` writes in-app notifications (Prisma `Notification` /
JSON `notifications`) from verification, campaign, donation, and milestone
services. Writes are best-effort so they never fail the triggering action.
The header `NotificationBell` polls the unread count every 60 s while the tab
is visible. `dashboardService` composes donor, organizer, and recipient
summaries from existing repositories (driver-agnostic) for `/dashboard`; the
public `ImpactStats` strip reuses `/campaigns/meta/stats`.

## Stellar SDK 17 & wallet kit 2 (Phase 12)

Stellar SDK 17 represents XDR as plain objects. Soroban parsing in
`src/blockchain/soroban/` reads fields through `xdrField` (accepts either the
accessor or the property shape) and decodes event topics/values with
`scValToNative`; contract function names and the donor/verifier address must
match exactly. On the frontend, `lib/wallet.js` wraps the static
`StellarWalletsKit` API, imports only the Freighter and xBull modules (sign-in
needs `signMessage`, which Albedo and Rabet lack), and persists the selected
wallet id across reloads. The backend accepts challenge signatures over the raw
message or per SEP-53.

## Auth

Wallet signature proves ownership. Sessions are server-side rows; cookie carries an opaque token; DB stores **SHA-256 hash** only.

## Blockchain vs database

PostgreSQL may store transaction hashes, ledger events, and
`BlockchainTransaction.contractAddress` for deposits. Confirmation of on-chain
success remains the Soroban verification path in `src/blockchain/soroban/`.
