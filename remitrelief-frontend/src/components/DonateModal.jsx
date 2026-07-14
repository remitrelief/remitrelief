import { useState } from "react";
import { connectWallet, signTransaction } from "../lib/wallet";
import { buildDonationTx, submitSignedTx } from "../lib/stellar";
import { Asset } from "@stellar/stellar-sdk";

export default function DonateModal({ campaign, onClose }) {
  const [amount, setAmount] = useState("5");
  const [status, setStatus] = useState("idle"); // idle | connecting | signing | submitting | done | error
  const [message, setMessage] = useState("");

  async function handleDonate() {
    try {
      setMessage("");
      setStatus("connecting");
      const donorPublicKey = await connectWallet();

      setStatus("signing");
      const tx = await buildDonationTx({
        donorPublicKey,
        escrowContractAddress: campaign.escrowAddress,
        amount,
        destAsset: new Asset("USDC", campaign.usdcIssuer),
      });
      const signedXDR = await signTransaction(tx.toXDR(), donorPublicKey);

      setStatus("submitting");
      await submitSignedTx(signedXDR);

      setStatus("done");
      setMessage("Donation sent successfully. Thank you for supporting the campaign.");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Something went wrong. Please try again or refresh the page.");
    }
  }

  return (
    <div className="modal">
      <div>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Donate securely</p>
            <h2>Donate to {campaign.name}</h2>
          </div>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <label>
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
