# Phase 11 Completion Report — Dashboards, Notifications, Impact

**Network:** Stellar TESTNET only. No production deploy, no mainnet, no contract
deployment.

## 1. In-app notifications

- Prisma `Notification` model + migration `20260929080000_phase11_notifications`;
  JSON store mirror (capped at 200 per user).
- `notificationsService`: best-effort `notifyUser` / `notifyMany` /
  `notifyCampaignStakeholders` (owner + recipient, optionally all donors,
  deduplicated, donor fan-out capped at 500).
- Triggers:

| Event | Who is notified |
| --- | --- |
| Verification reviewed | Applicant |
| Admin sets verification status | That user |
| Campaign status change | Owner |
| Donation recorded | Owner (labelled demo vs on-chain) |
| Proof submitted | Owner, unless they submitted it |
| Milestone verified | Owner + recipient, excluding the verifier |
| Milestone released | Owner + recipient + every donor |

- API: `GET /api/notifications`, `GET /api/notifications/unread-count`,
  `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.
  Scoped to the caller; rate limited.
- UI: `NotificationBell` in the header (unread badge, accessible label,
  Escape/click-outside to close, mark all read, click-through to the linked
  page). Polls every 60 s only while the tab is visible.

## 2. Dashboards

`GET /api/dashboard/me` returns donor, organizer, and recipient sections; the
`/dashboard` page (replaces `DonorDashboard`) renders whichever apply:

- **Donor:** total given (demo share called out), donations, campaigns
  supported, funds released on those campaigns, per-campaign progress.
- **Organizer (NGO):** campaigns by status, raised/released totals, milestones
  verified, and a "Needs your attention" list (submit, revise, next proof).
- **Recipient:** campaigns naming the user as recipient and funds released.
- A warning links to `/verification` when an NGO/recipient is not verified.
- Full donation history table with on-chain vs demo labels.

Campaign repositories gained a `recipientId` filter (JSON + Prisma).

## 3. Public impact stats

`ImpactStats` (raised on-chain, released, active campaigns, milestones
verified) appears on the campaign list and dashboard, reusing
`/campaigns/meta/stats`.

## 4. Bugs fixed

- **Release without verification in demo mode:** demo release skipped the
  verified-milestone check, so funds could be "released" with no proof. Now
  both modes return `MILESTONE_NOT_VERIFIED`.
- **Release amount missing:** releases without an explicit `amount` recorded
  none, so "released to recipients" stayed at 0. The milestone target amount
  is now used as the default.

## 5. Verification

- Backend `npm test`: 58/58, including `test/notifications-dashboard.test.js`
  (auth required; owner status/donation notifications; unverified release
  blocked; verify/release notifications to owner, donor, recipient with amount;
  read/read-all and cross-user isolation; donor/organizer/recipient dashboard
  numbers; public released total).
- Frontend `npm test`: 17/17 (new `NotificationBell.test.jsx`,
  `Dashboard.test.jsx`). `npm run build` succeeds; initial JS 187 kB
  (60 kB gzip).
- `prisma validate` passes.

## 6. Deferred

- Email/push delivery (in-app only).
- Real-time delivery (polling, no websockets).
- Stellar SDK 17 / react-router 7 upgrades.
