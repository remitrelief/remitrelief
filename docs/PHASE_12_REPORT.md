# Phase 12 Completion Report — Dependency Security Upgrades

**Network:** Stellar TESTNET only. No production deploy, no mainnet, no contract
deployment.

## 1. Outcome

| Package | Before | After |
| --- | --- | --- |
| Backend `npm audit` | 6 high | **0** |
| Frontend `npm audit` | 48 (2 critical, 12 high) | 19 (0 critical, 0 high; 13 low, 6 moderate) |

The 19 remaining frontend findings are all transitive through the wallet kit's
HOT wallet module (`@hot-wallet/sdk` → NEAR / Solana libraries: `elliptic`,
`secp256k1`, `jayson`, `uuid`, `stream-json`). The app imports only the
Freighter and Albedo modules, and a scan of `dist/` confirms none of that code
is bundled. npm's only offered fix is downgrading the kit to 1.5, which
reintroduces older issues, so these are accepted until the kit updates them.

## 2. Upgrades

| Package | From | To |
| --- | --- | --- |
| `@stellar/stellar-sdk` (backend + frontend) | 12.3 | 17.2 |
| `@creit.tech/stellar-wallets-kit` | 1.9 | 2.7 (shares the app's SDK 17 copy) |
| `react-router-dom` 6 → `react-router` | 6.30 | 7.18 |
| `vite` / `vitest` | 5.4 / 2.1 | 8.3 / 5.0 |
| `@vitejs/plugin-react` / `jsdom` | 4 / 25 | 6 / 30 |
| `prisma` / `@prisma/client` | 6.19.0 | 6.19.3 (`effect` fix) |

Backend `package.json` adds an npm `overrides` entry pinning
`@prisma/config`'s `deepmerge-ts` to `^8.0.2` (Prisma 6 still pins the
vulnerable 7.1.5). `prisma generate` was re-run to confirm the CLI still works.

Both packages now declare `engines.node >= 22.12.0` (required by SDK 17 and
Vite 8).

## 3. Breaking changes handled

- **XDR representation (SDK ≥ 15).** Unions and structs became plain objects
  (`func.invokeContract.functionName`) instead of accessor methods
  (`func.invokeContract().functionName()`). `extractContractInvocations`
  silently returned nothing, so **on-chain donation verification and signed
  `verify_milestone` validation would have rejected every real transaction**.
  `verification.js` now reads fields through `xdrField`, which supports both
  shapes. Event parsing (`events.js`) decodes topics/values with
  `scValToNative` instead of `.sym()` / `_value`, and normalizes the RPC
  `Contract` object to a strkey.
- **`Keypair#sign` returns `Uint8Array`** (not `Buffer`), so
  `.toString("base64")` produced comma-separated bytes. Server verification was
  unaffected (wallets send base64 strings); test signing moved to a shared
  `test/helpers/signing.js`.
- **Wallet kit 2** is a static API (`StellarWalletsKit.init/authModal/...`)
  with per-wallet module imports. `lib/wallet.js` was rewritten:
  - Imports only Freighter + Albedo, which roughly halves the lazy wallet
    chunks (1,374 kB → ~783 kB; 384 kB → ~181 kB gzip).
  - Persists the chosen wallet id (the kit does not restore it on reload) and
    only restores supported ids.
  - Normalizes kit `{ code, message }` rejections into `Error`s.
  - `signTransaction` fails fast with a reconnect message when no wallet is
    selected; `WalletContext.signAuthMessage` reopens the picker in that case.
  - `disconnect()` now also clears the kit session.
- **React Router 7.** Only declarative APIs are used, so no behavior change;
  imports moved from `react-router-dom` to `react-router` and the `-dom`
  package was removed.
- `submitSignedSorobanTx` no longer `JSON.stringify`s the XDR error result
  (SDK 17 XDR can contain `BigInt`, which would throw and mask the real error).

## 4. Security tightening found during the upgrade

- `assertExpectedInvocation` matched function names with `includes()`, so a
  call to e.g. `deposit_x` would satisfy an expected `deposit`. It now requires
  an exact match.
- The expected-address check skipped validation when the first argument could
  not be decoded (`null`). It now requires an exact match.

## 5. Verification

- Backend `npm test`: **64/64**. New `test/soroban-parsing.test.js` builds real
  SDK transactions, round-trips them through XDR and checks invocation
  extraction, the wrong contract/function/donor/amount cases, non-contract
  transactions, signed `verify_milestone` index validation, and ScVal event
  normalization.
- Frontend `npm test`: **23/23**. New `src/lib/wallet.test.js` covers init and
  restore, connect and persist, error normalization, signing without a
  selected wallet, the network passphrase on signing, an empty signature, and
  disconnect.
- `npm run build` (Vite 8) succeeds. The initial JS is 201 kB (66 kB gzip); the
  +14 kB is React Router 7.
- `prisma generate` succeeds with the override.

## 6. Not verified here

- A live Freighter/Albedo signature and a real TESTNET submission. The adapters
  are unit-tested against the kit's typed API, but a manual smoke test (connect,
  sign in, demo donation, NGO verify) is recommended before the next demo.

## 7. Deferred

- Wallet-kit transitive findings (upstream).
- Moving `package.json#prisma.seed` to `prisma.config.ts` (Prisma 7
  deprecation warning).
- Email/push notifications, proof file uploads, disputes/multisig.
