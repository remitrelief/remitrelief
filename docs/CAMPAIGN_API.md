# Campaign API

All canonical endpoints use the `/api` prefix. Authentication uses the existing
wallet-signature session and HttpOnly cookie. Successful campaign responses use
`{ "success": true, "data": ..., "meta": ... }`. Monetary values are decimal
strings.

## Public discovery

### `GET /api/campaigns`

Returns public `ACTIVE` and `COMPLETED` campaigns.

Query parameters:

- `search`: bounded title, summary, description, and location search.
- `category`: `MEDICAL`, `EDUCATION`, `FOOD`, `HOUSING`, `EMERGENCY`,
  `DISASTER`, `FAMILY`, or `COMMUNITY`.
- `sort`: `newest`, `oldest`, `ending_soon`, `goal_low`, `goal_high`, or
  `progress`.
- `page`: positive integer.
- `limit`: 1–50.

Pagination metadata contains `page`, `limit`, `total`, and `totalPages`.

### `GET /api/campaigns/:id`

Accepts a campaign ID or slug. Unlisted campaigns are available by direct link.
Private and non-public lifecycle states are visible only to owners, authorized
organization managers, and administrators. Public responses omit rejection
reasons and private audit data.

## Owner management

All endpoints below require authentication.

- `GET /api/campaigns/mine`
- `POST /api/campaigns`
- `PATCH /api/campaigns/:id`
- `DELETE /api/campaigns/:id`
- `POST /api/campaigns/:id/submit`

Creation always derives the owner from the authenticated session and creates a
`DRAFT`. Client-provided owner IDs and financial totals are ignored. Only
donation-free drafts can be deleted.

Creation fields:

```json
{
  "title": "Community medical support",
  "shortDescription": "A concise public summary.",
  "description": "A detailed plain-text campaign story.",
  "category": "MEDICAL",
  "goalAmount": "10000.00",
  "currency": "USDC",
  "deadline": "2027-01-01T00:00:00.000Z",
  "recipientId": "registered-user-id",
  "organizationId": "optional-organization-id",
  "visibility": "PUBLIC",
  "coverImage": "https://example.test/image.jpg",
  "milestones": []
}
```

An organization can be assigned only by an active organization `OWNER` or
`MANAGER`, or by an administrator.

## Moderation

`GET /api/campaigns/admin/queue` requires `ADMIN` and returns campaigns in
`SUBMITTED`, `UNDER_REVIEW`, or `APPROVED` (optional `?status=` narrows the set).

`POST /api/campaigns/:id/transitions/:status` requires `ADMIN`.

Allowed transitions:

```text
DRAFT → SUBMITTED | CANCELLED
SUBMITTED → UNDER_REVIEW | CANCELLED
UNDER_REVIEW → APPROVED | REJECTED | CANCELLED
APPROVED → ACTIVE | CANCELLED
ACTIVE → COMPLETED | EXPIRED | CANCELLED
COMPLETED → CLOSED
```

Rejection requires `{ "reason": "..." }`. Owners cannot approve or activate
their own campaigns.

Outside `DEMO_MODE`, `APPROVED → ACTIVE` requires a bound escrow address
(`ESCROW_REQUIRED` if missing). Optional body fields on activate:

```json
{ "escrowAddress": "C…", "usdcIssuer": "C…" }
```

## Escrow binding

`POST /api/campaigns/:id/escrow` requires `ADMIN`.

Binds a pre-deployed TESTNET escrow contract ID on an `APPROVED` campaign.
Already-bound `ACTIVE` campaigns cannot change escrow. Body:

```json
{ "escrowAddress": "C…", "usdcIssuer": "optional-USDC-contract-id" }
```

Related error codes: `ESCROW_REQUIRED`, `ESCROW_INVALID`, `ESCROW_NOT_BOUND`,
`ESCROW_MISMATCH`, `CAMPAIGN_NOT_ACTIVE`.

## Donations

- `POST /api/donations/prepare` — authenticated; body `{ "campaignId", "amount" }`.
  Uses the campaign's bound escrow only; ignores client `escrowAddress`.
- `POST /api/donations` — records verified on-chain deposits, or demo donations
  only when `DEMO_MODE=true` and the campaign has no escrow.

## Proof, verify, and release

- `POST /api/milestones/:id/proof` — NGO/ADMIN; body
  `{ "milestoneIndex", "note", "evidenceUrls?: string[]" }`. Requires ACTIVE
  campaign. Note min length 10.
- `GET /api/milestones/:id/proofs` — list proofs (optional `?milestoneIndex=`).
- `POST /api/milestones/:id/prepare-verify` — NGO/ADMIN; uses bound escrow and
  requires a prior proof.
- `POST /api/milestones/:id/verify` — NGO/ADMIN; `autoRelease` defaults false.
- `POST /api/milestones/:id/release` — ADMIN or internal API key; requires prior
  verify when escrow is bound.

Related codes: `PROOF_REQUIRED`, `PROOF_INVALID`, `MILESTONE_ALREADY_VERIFIED`,
`MILESTONE_NOT_VERIFIED`, `MILESTONE_ALREADY_RELEASED`.

Release requires a verified milestone in both demo and on-chain modes. When no
`amount` is sent, the ledger release amount defaults to the milestone target.

## Organizations (status only — not KYC)

- `GET /api/organizations/mine` — authenticated memberships
- `POST /api/organizations` — create as `PENDING` (caller becomes `OWNER`)
- `GET /api/organizations/pending` — ADMIN pending list
- `POST /api/organizations/:id/status` — ADMIN sets
  `PENDING` | `VERIFIED` | `SUSPENDED` | `REJECTED`

Organization verification is an application status gate. It is **not** identity
KYC.

## User verification (KYC-lite — status only)

- `GET /api/verification/me` — caller's `verificationStatus`, roles, and request history
- `POST /api/verification/request` — body `{ requestedRole: "NGO"|"RECIPIENT",
  statement (≥20 chars), evidenceUrls?: string[] (≤5, http/https) }`; one
  pending request at a time; sets user to `PENDING` (201)
- `GET /api/verification/pending` — ADMIN queue
- `POST /api/verification/:id/review` — ADMIN body
  `{ status: "VERIFIED"|"REJECTED", reviewNote? (≤1000) }`; `VERIFIED` grants the
  requested role. A user who is already `VERIFIED` stays `VERIFIED` if a
  second-role request is rejected; a `SUSPENDED` user stays suspended.
- `POST /api/verification/users/:walletAddress/status` — ADMIN body
  `{ status: "SUSPENDED"|"VERIFIED"|"UNVERIFIED", reason? (≤1000) }`.
  Rejects self-changes and admin targets (admins come from `ADMIN_PUBLIC_KEYS`);
  404 for unknown wallets. Audited as `USER_VERIFICATION_STATUS_SET`.

Suspended users cannot submit a new request (403) and are blocked from proof and
verify actions. Statement max 2000 characters; more than 5 evidence URLs is
rejected. Write endpoints on this router are rate limited (60 per 15 minutes).

Statuses: `UNVERIFIED` | `PENDING` | `VERIFIED` | `REJECTED` | `SUSPENDED`.
NGO/RECIPIENT actors must be `VERIFIED` to submit proof, prepare verify, or
verify milestones (`VERIFICATION_REQUIRED`, 403). ADMIN bypasses the gate.
Wallets in `NGO_PUBLIC_KEYS` / `RECIPIENT_PUBLIC_KEYS` / `ADMIN_PUBLIC_KEYS`
are seeded as `VERIFIED`. No documents are stored — URLs only.

## Notifications (Phase 11)

All require authentication and only ever touch the caller's own rows.

- `GET /api/notifications?unread=true&limit=20` — `{ items, unreadCount }` (limit ≤50)
- `GET /api/notifications/unread-count` — `{ unreadCount }`
- `POST /api/notifications/:id/read` — 404 if the id belongs to someone else
- `POST /api/notifications/read-all` — `{ updated }`

Triggers: verification reviewed, admin status change, campaign status change
(owner), donation received (owner), proof submitted (owner, unless they
submitted it), milestone verified (owner + recipient, excluding the verifier),
milestone released (owner + recipient + every donor). Delivery is best-effort;
a failed notification never fails the underlying action. The JSON store keeps
the latest 200 per user.

## Dashboard (Phase 11)

- `GET /api/dashboard/me` — `{ roles, verificationStatus, unreadNotifications,
  donor, organizer, recipient }`. `donor` covers total given (with on-chain
  subset), supported campaigns and released funds on them; `organizer` covers
  owned campaigns by status, totals, and `needsAttention` next actions;
  `recipient` covers campaigns naming the caller as recipient (excluding their
  own). `organizer`/`recipient` are `null` when not applicable.

## Admin transparency

- `GET /api/admin/audits?limit=` — recent audit rows (ADMIN)
- `GET /api/admin/indexer` — escrow campaign count + cursors (ADMIN)

## Public ledger

`GET /api/ledger?campaignId=&type=&limit=&page=&verifiedOnChain=`

Returns `{ "success": true, "data": [...], "meta": { page, limit, total, totalPages } }`.
`verifiedOnChain=true|false` filters trust. On-chain indexed rows set
`verifiedOnChain: true` and `eventTrust: "on_chain_verified"`.

`GET /api/ledger/stats` includes `onChainLedgerEvents` and `demoLedgerEvents`.

## Admin indexer

- `GET /api/admin/indexer` — escrow campaign count, cursors, `lastRun`
- `POST /api/admin/indexer/run` — body
  `{ limitPerContract?, maxPages?, campaignId?, backfill?, lookbackLedgers? }`

Internal cron/API-key routes under `/api/internal/indexer/*` accept the same options.

## Milestones

- `POST /api/campaigns/:id/milestones`
- `PATCH /api/campaigns/:id/milestones/:milestoneId`

Milestones are editable only while the campaign is a draft. Each has a title,
description, positive decimal `targetAmount`, and deterministic `sequence`.
Submission requires milestone totals to equal the campaign goal.

After on-chain (or demo) verify/release, relational milestone `verified` /
`released` flags and campaign counters are updated.

## Campaign updates

- `GET /api/campaigns/:id/updates`
- `POST /api/campaigns/:id/updates`
- `PATCH /api/campaigns/:id/updates/:updateId`

Owners, authorized organization managers, and administrators can create updates
for approved, active, or completed campaigns. Pass `publish: true` to publish;
public users see published updates only.

## Media metadata

- `POST /api/campaigns/:id/media`
- `DELETE /api/campaigns/:id/media/:mediaId`

The API stores validated URLs and metadata, never binary files. Supported types
are `IMAGE`, `VIDEO`, and `DOCUMENT`; Phase 4 UI uses images. Setting `isCover`
atomically replaces the previous cover.

## Errors

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "CAMPAIGN_INVALID_STATE",
    "message": "Campaign cannot transition from DRAFT to COMPLETED"
  }
}
```

Campaign-specific codes include access, editability, lifecycle, goal, deadline,
category, currency, recipient, organization, milestone, update, media, and
escrow errors. Descriptions and updates are plain text and must be rendered as
text, not injected HTML.
