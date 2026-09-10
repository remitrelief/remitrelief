# RemitRelief Backend

Express API + Soroban adapters for RemitRelief.

## Architecture

```
Route → Controller → Service → Repository → Prisma → PostgreSQL
                            ↘ blockchain/soroban/*
```

Production requires PostgreSQL. The JSON driver is an explicit local/offline
fixture and is rejected in production.

## Environment

See `.env.example`. Important:

| Variable | Purpose |
|----------|---------|
| `DEMO_MODE` | Allow demo financial mutations (forced off in production) |
| `STELLAR_NETWORK` | `TESTNET` (default). Mainnet rejected. |
| `BACKEND_SIGNER_SECRET` | Server signer for reads/release — never send to frontend |
| `INTERNAL_API_KEY` | Required for privileged standalone `/release` |
| `DEMO_ESCROW_CONTRACT_ID` | Optional seed campaign escrow |

## Scripts

```bash
npm run dev
npm start
npm test
npm run test:db
npm run test:contract
npm run prisma:validate
npm run prisma:migrate
npm run prisma:seed
```

## API notes

Canonical APIs use `/api/*`. Direct-backend legacy aliases remain available for
local compatibility.

- `GET /api/campaigns` — public search, filters, sorting, and pagination
- `POST /api/campaigns` — creates an authenticated user's draft
- `PATCH /api/campaigns/:id` — edits an authorized draft
- `POST /api/campaigns/:id/submit` — validates and submits a draft
- `POST /api/campaigns/:id/transitions/:status` — ADMIN moderation
- `POST /api/donations` — verifies on-chain deposit or records clearly marked local demo data
- `POST /api/milestones/:id/verify` — existing Soroban verification path
- `POST /api/milestones/:id/release` — existing protected release path
- Ledger events include `verifiedOnChain` + `source` (`on_chain` | `demo`)

See `../docs/CAMPAIGN_API.md` for the Phase 4 campaign contract.
