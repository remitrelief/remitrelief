import { useState } from "react";
import { signTransaction } from "../lib/wallet";
import { submitSignedSorobanTx } from "../lib/stellar";
import { prepareDeposit, recordDonation } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { campaignTitle } from "./CampaignUI";

const PRESETS = [5, 10, 25, 50, 100];

export default function DonateModal({ campaign, onClose, onSuccess }) {
  const title = campaignTitle(campaign);
  const { ensureAuthenticated } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState("25");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  async function handleDonate() {
    const donationAmount = Number(amount);
    if (!donationAmount || donationAmount <= 0) {
      setFeedback("Please enter a valid donation amount.");
      setStatus("error");
      return;
    }

    try {
      setFeedback("");
      setStatus("connecting");
      const donorPublicKey = await ensureAuthenticated();

      let txHash = null;
      const hasEscrow = Boolean(campaign.escrowAddress);

      if (hasEscrow) {
        setStatus("preparing");
        const { unsignedXdr } = await prepareDeposit({
          escrowAddress: campaign.escrowAddress,
          donorPublicKey,
          amount: donationAmount,
        });

        setStatus("signing");
        const signedXDR = await signTransaction(unsignedXdr, donorPublicKey);

        setStatus("submitting");
        const result = await submitSignedSorobanTx(signedXDR);
        txHash = result.hash;
      } else {
        setStatus("submitting");
        await new Promise((r) => setTimeout(r, 500));
      }

      await recordDonation({
        campaignId: campaign.id,
        donor: donorPublicKey,
        amount: donationAmount,
        txHash,
        status: hasEscrow ? "escrowed" : "demo-escrowed",
        message,
        demo: !hasEscrow,
      });

      setStatus("done");
      const okMsg = hasEscrow
        ? "Donation deposited into escrow."
        : "Demo donation recorded — deploy escrow for on-chain settlement.";
      setFeedback(okMsg);
      toast.push(`Donated $${donationAmount} to ${title}`, "success");
      if (typeof onSuccess === "function") {
        onSuccess(campaign.id, donationAmount, donorPublicKey);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
      setFeedback(err.message || "Something went wrong while processing your donation.");
      toast.push("Donation failed", "error");
    }
  }

  const busy = !["idle", "error", "done"].includes(status);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="donate-title">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Donate securely</p>
            <h2 id="donate-title">Donate to {title}</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="modal-copy">
          {campaign.escrowAddress
            ? "Your USDC is deposited into the Soroban escrow and released only after verified milestones."
            : "Demo mode — donations are recorded locally until an escrow contract is deployed."}
        </p>

        <div className="amount-presets" role="group" aria-label="Suggested amounts">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`preset ${Number(amount) === preset ? "active" : ""}`}
              onClick={() => setAmount(String(preset))}
              disabled={busy || status === "done"}
            >
              ${preset}
            </button>
          ))}
        </div>

        <label className="input-label" htmlFor="donate-amount">
          Amount (USD)
          <input
            id="donate-amount"
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy || status === "done"}
          />
        </label>

        <label className="input-label" htmlFor="donate-message">
          Optional note
          <input
            id="donate-message"
            type="text"
            maxLength={200}
            placeholder="e.g. For clean water kits"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy || status === "done"}
          />
        </label>

        <div className="modal-actions">
          <button type="button" onClick={handleDonate} disabled={busy || status === "done"}>
            {status === "idle" && `Donate $${Number(amount) || 0}`}
            {status === "connecting" && "Connecting wallet…"}
            {status === "preparing" && "Preparing escrow deposit…"}
            {status === "signing" && "Waiting for signature…"}
            {status === "submitting" && "Submitting…"}
            {status === "done" && "Sent ✓"}
            {status === "error" && "Try again"}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>

        {feedback && (
          <p className={`message ${status === "error" ? "error" : "success"}`} role="status">
            {feedback}
          </p>
        )}
      </div>
    </div>
  );
}
