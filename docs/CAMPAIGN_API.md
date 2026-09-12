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
