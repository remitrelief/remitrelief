# Phase 10 Completion Report — Demo Readiness

**Network:** Stellar TESTNET only. No production deploy, no mainnet, no contract
deployment.

## 1. Frontend performance

| Chunk | Before | After |
| --- | --- | --- |
| Initial `index-*.js` | 1,557 kB (443 kB gzip) | 183 kB (59 kB gzip) |
| `wallet-*.js` (lazy) | — | 1,374 kB (384 kB gzip) |

`WalletContext` loaded on every page and statically imported the wallet kit and
Stellar SDK. It now dynamic-imports `lib/wallet.js` on connect/sign.
`shortenAddress` moved to `lib/address.js` so pages no longer pull the SDK for
string formatting. The wallet chunk still exceeds Vite's 500 kB warning; it only
loads when a wallet action happens.

## 2. Admin suspension

- `POST /api/verification/users/:walletAddress/status` (ADMIN):
  `SUSPENDED` | `VERIFIED` | `UNVERIFIED`, optional reason, audited.
- Rejects self-changes, admin targets, unknown wallets.
- `UserAccessControl` component on the admin dashboard (address validation,
  accessible labels, disabled until valid).

## 3. Bugs fixed

- **Suspension bypass:** a suspended user could submit a new verification
  request, which reset them to `PENDING`. Now 403.
- **Access loss on second-role request:** a verified NGO applying for
  RECIPIENT dropped to `PENDING` (losing proof/verify access) and to `REJECTED`
  if denied. Verified users now stay verified.
- **Verification page:** verified users could not request a second role;
  suspended users saw a form the API rejects; a failed load showed a false
  `UNVERIFIED`; empty history rendered as an error; double submit possible.
- **Frontend tests:** Testing Library never unmounted between tests (Vitest
  globals off), so multi-test files leaked DOM. `src/test/setup.js` now runs
  `cleanup()` after each test.

## 4. Security pass

- Every state-changing route requires auth or ADMIN, except intentional
  `auth/challenge`, `auth/verify`, `auth/logout`, and internal routes guarded
  by the internal API key.
- Shared `createMutationLimiter` now covers verification, organizations,
  milestones, and donations (campaigns already had one; auth has its own).
- Input limits: statement ≤2000, review note/reason ≤1000, ≤5 evidence URLs.
- `npm audit fix` (non-breaking) applied. Remaining:
  - Backend: 6 high, all `toml` via `@stellar/stellar-sdk` ≤15 (fix is SDK 17,
    a breaking upgrade).
  - Frontend: 43 (mostly transitive via `@creit.tech/stellar-wallets-kit` /
    Trezor, including `elliptic`), plus `react-router` 6 (fix requires 7.18+).

## 5. Verification

- Backend `npm test`: 51/51, including new `test/demo-walkthrough.test.js`
  (NGO verified via queue → campaign created/approved/activated → demo donation
  → proof → verify → admin release → ledger shows verify/release as
  non-on-chain → suspension blocks proof and reapply → reinstatement restores
  access → second-role request keeps VERIFIED → admin guard cases).
- Frontend `npm test`: 11/11 (new `VerificationWorkspace.test.jsx`,
  `UserAccessControl.test.jsx`). `npm run build` succeeds.

## 6. Deferred

- Stellar SDK 17 / react-router 7 upgrades (breaking; separate phase).
- Full KYC, contract deploys, mainnet, production deploy.
- Proof file uploads; disputes/clawback/multi-sig.
