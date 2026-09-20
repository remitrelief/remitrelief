# RemitRelief Frontend

React + Vite donor experience for milestone-escrowed disaster relief on Stellar.

## Pages

- `/campaigns` — campaign list with search, category chips, sort
- `/campaign/:id` — detail, milestones, proofs, activity, share
- `/create-campaign` — create a campaign with milestone tranches + org picker
- `/dashboard` — donor history (wallet + session)
- `/dashboard/campaigns` — organizer campaign list
- `/organizations` — create/list organizations (status only, not KYC)
- `/admin` — ADMIN moderation queue, pending orgs, audits, indexer
- `/ledger` — public transparency ledger (`type`, `campaignId`, trust, pagination)
- `/verify` — NGO/ADMIN proof → verify → release (NGO scoped to mine)

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Requires the API at `VITE_API_URL` (default `http://localhost:4000`).
