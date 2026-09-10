import { useEffect, useState } from "react";
import { fetchCampaigns, prepareVerify, submitVerify } from "../lib/api";
import { signTransaction } from "../lib/wallet";
import MilestoneTimeline from "../components/MilestoneTimeline";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function VerifyPage() {
  const { ensureAuthenticated } = useAuth();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [proofNote, setProofNote] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCampaigns()
      .then(({ data: list = [] }) => {
        setCampaigns(list);
        if (list[0]) setCampaignId(list[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  const campaign = campaigns.find((c) => c.id === campaignId);
  const milestones =
    campaign?.milestoneLabels?.map((m) => ({
      index: m.index,
      label: m.label,
      amountUsd: m.amount,
      verified: m.index < (campaign.milestonesVerified || 0),
      released: m.index < (campaign.milestonesVerified || 0),
    })) || [];

  async function handleVerifyAndRelease() {
    if (!campaign) return;
    setError(null);
    setMessage("");

    try {
      setStatus("connecting");
      const verifierPublicKey = await ensureAuthenticated();
      const hasEscrow = Boolean(campaign.escrowAddress);

      if (hasEscrow) {
        setStatus("preparing");
        const { unsignedXdr } = await prepareVerify(campaign.id, {
          escrowAddress: campaign.escrowAddress,
          milestoneIndex: Number(milestoneIndex),
          verifierPublicKey,
        });

        setStatus("signing");
        const signedXDR = await signTransaction(unsignedXdr, verifierPublicKey);

        setStatus("verifying");
        await submitVerify(campaign.id, {
          escrowAddress: campaign.escrowAddress,
          milestoneIndex: Number(milestoneIndex),
          verifierPublicKey,
          verifierSignedXDR: signedXDR,
          campaignId: campaign.id,
          proofNote,
          autoRelease: true,
        });
      } else {
        setStatus("verifying");
        await submitVerify(campaign.id, {
          campaignId: campaign.id,
          milestoneIndex: Number(milestoneIndex),
          verifierPublicKey,
          proofNote,
          demo: true,
          autoRelease: true,
        });
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campaign.id
              ? {
                  ...c,
                  milestonesVerified: Math.min(
                    c.milestonesTotal,
                    Math.max(c.milestonesVerified, Number(milestoneIndex) + 1)
                  ),
                }
              : c
          )
        );
      }

      setStatus("done");
      const ok = hasEscrow
        ? `Milestone ${milestoneIndex} verified and released on-chain.`
        : `Demo: milestone ${milestoneIndex} verified and released.`;
      setMessage(ok);
      toast.push("Milestone verified & released", "success");
      setProofNote("");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err.message || "Verification failed");
      toast.push("Verification failed", "error");
    }
  }

  const busy = !["idle", "error", "done"].includes(status);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">NGO / verifier</p>
          <h1>Verify a milestone</h1>
          <p className="hero-copy">
            Confirm on-the-ground delivery with a proof note, then release the matching escrow
            tranche to the recipient.
          </p>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <label className="input-label" htmlFor="verify-campaign">
            Campaign
            <select
              id="verify-campaign"
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setMilestoneIndex(0);
                setStatus("idle");
                setMessage("");
              }}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="input-label" htmlFor="verify-milestone">
            Milestone to verify
            <select
              id="verify-milestone"
              value={milestoneIndex}
              onChange={(e) => setMilestoneIndex(Number(e.target.value))}
            >
              {(campaign?.milestoneLabels || []).map((m) => (
                <option key={m.index} value={m.index}>
                  #{m.index}: {m.label} (${m.amount.toLocaleString()})
                </option>
              ))}
            </select>
          </label>

          <label className="input-label" htmlFor="proof-note">
            Proof of delivery note
            <textarea
              id="proof-note"
              rows={3}
              placeholder="e.g. 200 water kits delivered — GPS photos attached in field report #482"
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              maxLength={500}
            />
          </label>

          <p className="modal-copy">
            {campaign?.escrowAddress
              ? "Your wallet must be an allowlisted verifier on the escrow contract."
              : "Demo mode — verification updates the local ledger without an on-chain call."}
          </p>

          <div className="modal-actions">
            <button type="button" onClick={handleVerifyAndRelease} disabled={busy || !campaign}>
              {status === "idle" && "Verify & release"}
              {status === "connecting" && "Connecting wallet…"}
              {status === "preparing" && "Preparing transaction…"}
              {status === "signing" && "Awaiting signature…"}
              {status === "verifying" && "Verifying & releasing…"}
              {status === "done" && "Complete ✓"}
              {status === "error" && "Try again"}
            </button>
          </div>

          {message && <p className="message success">{message}</p>}
          {error && <p className="message error">{error}</p>}
        </section>

        <section className="panel">
          <h2>Current milestones</h2>
          <MilestoneTimeline milestones={milestones} />
        </section>
      </div>
    </div>
  );
}
