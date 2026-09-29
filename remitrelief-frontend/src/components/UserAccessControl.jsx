import { useId, useState } from "react";

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

const ACTIONS = [
  { status: "SUSPENDED", label: "Suspend", className: "secondary compact" },
  { status: "VERIFIED", label: "Reinstate", className: "compact" },
  { status: "UNVERIFIED", label: "Reset", className: "secondary compact" },
];

/**
 * Admin control to suspend, reinstate, or reset a user's verification status by wallet.
 * `onSetStatus(walletAddress, status, reason)` should return a promise.
 */
export default function UserAccessControl({ onSetStatus }) {
  const walletId = useId();
  const reasonId = useId();
  const [walletAddress, setWalletAddress] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = walletAddress.trim();
  const valid = STELLAR_ADDRESS.test(trimmed);

  async function handle(status) {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSetStatus(trimmed, status, reason.trim() || undefined);
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby={`${walletId}-heading`}>
      <h2 id={`${walletId}-heading`}>User access</h2>
      <p className="muted">
        Suspend or reinstate a wallet&apos;s verification status. Suspended users cannot submit
        proof or verify milestones. Admin wallets are managed via environment allowlist.
      </p>
      <label className="input-label" htmlFor={walletId}>
        Wallet address
      </label>
      <input
        id={walletId}
        value={walletAddress}
        onChange={(event) => setWalletAddress(event.target.value)}
        placeholder="G…"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={trimmed.length > 0 && !valid}
      />
      {trimmed.length > 0 && !valid && (
        <p className="message error" role="alert">
          Enter a valid Stellar public key (starts with G, 56 characters).
        </p>
      )}
      <label className="input-label" htmlFor={reasonId}>
        Reason (optional)
      </label>
      <input
        id={reasonId}
        value={reason}
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="management-actions">
        {ACTIONS.map((action) => (
          <button
            key={action.status}
            type="button"
            className={action.className}
            disabled={!valid || busy}
            onClick={() => handle(action.status)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
