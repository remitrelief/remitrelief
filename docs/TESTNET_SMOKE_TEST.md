# TESTNET Smoke Test (live wallet)

A manual check of the parts automated tests cannot cover: a real wallet
extension signing in, and the full demo story in the browser. About 20 minutes.

**TESTNET only.** Never use a wallet that holds real funds; create fresh test
accounts.

## 0. Setup (once)

1. Node.js 22.12+ (`node --version`).
2. Install **Freighter** (browser extension). Optionally also **xBull** to test
   the second wallet. Albedo is intentionally not offered: it cannot sign the
   sign-in message.
3. In Freighter, switch the network to **Testnet** and create **three
   accounts**: `Admin`, `NGO`, `Donor`. Copy the Admin public key (`G…`).
   Funding is not needed for Parts A–C (sign-in is a message signature, not a
   transaction).
4. Backend:

   ```bash
   cd remitrelief-backend
   cp .env.example .env
   # edit .env: ADMIN_PUBLIC_KEYS=<Admin G… key>   (keep DEMO_MODE=true, STORE_DRIVER=json)
   npm install
   npm run dev          # http://localhost:4000
   ```

5. Frontend (second terminal):

   ```bash
   cd remitrelief-frontend
   cp .env.example .env # VITE_API_URL empty = use the /api dev proxy
   npm install
   npm run dev          # open http://localhost:5173
   ```

To act as a different person: click **Sign out**, then **Disconnect**, switch
the account in Freighter, then **Connect wallet** again.

## Part A — Wallet connection and sign-in (most important)

| # | Do | Expect |
| --- | --- | --- |
| A1 | Click **Connect wallet** | Kit modal lists Freighter and xBull (no Albedo) |
| A2 | Choose Freighter, approve access (Donor account) | Header shows the short address |
| A3 | Click **Sign in**, approve the message in Freighter | Header shows `· DONOR`, notification bell appears |
| A4 | Reload the page | Still signed in (session cookie) |
| A5 | Sign out, then **Sign in** again without reconnecting | Freighter prompts for the message; sign-in succeeds (the saved wallet choice survived the reload) |
| A6 | Click **Disconnect**, then **Connect wallet** and close the modal | Modal closes, you stay disconnected, **Connect wallet** works again (no blank page or stuck "Connecting…") |
| A7 | (Optional) Repeat A1–A3 with xBull | Same as Freighter |

## Part B — NGO onboarding and campaign

| # | Do | Expect |
| --- | --- | --- |
| B1 | As **NGO**: **Verification** → request role NGO with a statement → **Submit for review** | Status PENDING |
| B2 | As **Admin** (header shows `· ADMIN`): **Admin** → Pending identity verification → Verify | Request disappears from the queue |
| B3 | As **NGO**: bell shows a notification; **Create** → fill the form with 2 milestones (e.g. 40 + 60) → **Submit for review** | Campaign status SUBMITTED |
| B4 | As **Admin**: Admin → Moderation queue → open the campaign → click **UNDER REVIEW**, **APPROVED**, **ACTIVE** in turn | Status ACTIVE (demo mode allows no escrow) |

## Part C — Donation, proof, verify, release (demo path)

| # | Do | Expect |
| --- | --- | --- |
| C1 | As **Donor**: open the campaign → Donate $25 | "Demo donation recorded (not verified on-chain)" |
| C2 | As **NGO**: bell shows "donation received"; **Verify** → pick milestone #0 → write a note → **Submit proof** | "Proof submitted for milestone 0." |
| C3 | As **NGO**: **Verify milestone** (leave auto-release unchecked) | "Milestone 0 verified. Release separately when ready." |
| C4 | As **Admin**: **Verify** → same campaign/milestone → **Release funds** | "Milestone 0 funds released." |
| C5 | As **Donor**: bell shows the release; **Dashboard** shows "Released on campaigns you back" = 40; **Ledger** shows the release labelled demo | Numbers match |

## Part D — On-chain signing (optional)

Only possible if you already have a **pre-deployed TESTNET escrow contract ID**
(this project does not deploy contracts). Fund the Donor via Friendbot in
Freighter, then as Admin bind the escrow in the campaign's **Escrow binding**
panel before activating. The donate button then asks Freighter to **sign a
transaction**; expect "Donation deposited into escrow." and a tx hash on the
ledger. If you have no escrow ID, skip this part.

## If something fails

Send me:

1. The step number (e.g. A3).
2. The red error text on the page, and any error in the browser console (F12 →
   Console).
3. The backend terminal lines around the failure. For sign-in problems, look
   for `auth.audit` with `"reason":"…"` (e.g. `invalid_signature`).
4. Wallet name and version (Freighter → Settings → About).
