import { useState } from "react";
import { connectWallet, signTransaction } from "../lib/wallet";
import { buildDonationTx, submitSignedTx } from "../lib/stellar";
import { Asset } from "@stellar/stellar-sdk";

export default function DonateModal({ campaign, onClose, onSuccess }) {
  const [amount, setAmount] = useState("5");
  const [status, setStatus] = useState("idle"); // idle | connecting | signing | submitting | done | error
  const [message, setMessage] = useState("");

  async function handleDonate() {
    const donationAmount = Number(amount);
    if (!donationAmount || donationAmount <= 0) {
      setMessage("Please enter a valid donation amount.");
      setStatus("error");
      return;
    }

    try {
      setMessage("");
      setStatus("connecting");
      const donorPublicKey = await connectWallet();

      setStatus("signing");
      const tx = await buildDonationTx({
        donorPublicKey,
        escrowContractAddress: campaign.escrowAddress,
        amount: donationAmount.toFixed(2),
        destAsset: new Asset("USDC", campaign.usdcIssuer),
      });
      const signedXDR = await signTransaction(tx.toXDR(), donorPublicKey);

      setStatus("submitting");
      await submitSignedTx(signedXDR);

      setStatus("done");
      setMessage("Donation sent successfully. Your contribution is reflected below.");
      if (typeof onSuccess === "function") {
        onSuccess(campaign.id, donationAmount);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Something went wrong while processing your donation. Please try again.");
    }
  }

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Donate securely</p>
            <h2>Donate to {campaign.name}</h2>
          </div>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="modal-copy">
          Enter an amount in USD and complete the donation using your Stellar wallet. Funds will be routed into the escrow contract for verified release.
        </p>

        <label className="input-label">
          Amount (USD)
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button onClick={handleDonate} disabled={status !== "idle" && status !== "error"}>
            {status === "idle" && "Confirm donation"}
            {status === "connecting" && "Connecting wallet…"}
            {status === "signing" && "Waiting for signature…"}
            {status === "submitting" && "Submitting to Stellar…"}
            {status === "done" && "Sent ✓"}
            {status === "error" && "Try again"}
          </button>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>

        {message && <p className={`message ${status === "error" ? "error" : "success"}`}>{message}</p>}
      </div>
    </div>
  );
}
