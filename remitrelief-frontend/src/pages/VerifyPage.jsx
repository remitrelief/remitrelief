import { useCallback, useEffect, useState } from "react";
import {
  fetchCampaign,
  fetchCampaigns,
  fetchMilestoneProofs,
  fetchMyCampaigns,
  prepareVerify,
  submitProof,
  submitRelease,
  submitVerify,
} from "../lib/api";
import { signTransaction } from "../lib/wallet";
import MilestoneTimeline from "../components/MilestoneTimeline";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function VerifyPage() {
  const { ensureAuthenticated, user } = useAuth();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");
  const [campaign, setCampaign] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [proofNote, setProofNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [autoRelease, setAutoRelease] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);

  const loadCampaignDetail = useCallback(async (id) => {
    if (!id) return;
    const [detail, proofList] = await Promise.all([
      fetchCampaign(id),
      fetchMilestoneProofs(id).catch(() => []),
    ]);
    setCampaign(detail);
    setProofs(Array.isArray(proofList) ? proofList : []);
  }, []);

  useEffect(() => {
    const isAdmin = Boolean(user?.roles?.includes("ADMIN"));
    const loader = isAdmin
      ? fetchCampaigns({ limit: 100 }).then((result) => result.data || [])
      : fetchMyCampaigns({ limit: 100 }).then((result) => result.data || []);

    loader
      .then((list) => {
        const active = list.filter((item) => (item.effectiveStatus || item.status) === "ACTIVE");
        const scoped = active.length ? active : list;
        setCampaigns(scoped);
        if (scoped[0]) setCampaignId(scoped[0].id);
      })
      .catch((err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!campaignId) return;
    loadCampaignDetail(campaignId).catch((err) => setError(err.message));
  }, [campaignId, loadCampaignDetail]);

  const milestones =
    campaign?.milestones?.length > 0
      ? campaign.milestones
      : (campaign?.milestoneLabels || []).map((m) => ({
          index: m.index,
          label: m.label,
          amount: m.amount,
          verified: m.index < (campaign.milestonesVerified || 0),
          released: false,
        }));

  const selected = milestones.find(
    (item) => Number(item.index ?? item.sequence) === Number(milestoneIndex)
  );
  const canRelease =
    Boolean(user?.roles?.includes("ADMIN")) &&
    Boolean(selected?.verified) &&
    !selected?.released;

  async function handleSubmitProof() {
    if (!campaign) return;
    setError(null);
    setMessage("");
    try {
      setStatus("connecting");
      await ensureAuthenticated();
      setStatus("submitting");
      await submitProof(campaign.id, {
        campaignId: campaign.id,
        milestoneIndex: Number(milestoneIndex),
        note: proofNote,
        evidenceUrls: evidenceUrl.trim() ? [evidenceUrl.trim()] : [],
      });
      setStatus("done");
      setMessage(`Proof submitted for milestone ${milestoneIndex}.`);
      toast.push("Proof submitted", "success");
      setProofNote("");
      setEvidenceUrl("");
      await loadCampaignDetail(campaign.id);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err.message || "Proof submission failed");
      toast.push("Proof failed", "error");
    }
  }

  async function handleVerify() {
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
          campaignId: campaign.id,
          milestoneIndex: Number(milestoneIndex),
        });

        setStatus("signing");
        const signedXDR = await signTransaction(unsignedXdr, verifierPublicKey);

        setStatus("verifying");
        await submitVerify(campaign.id, {
          campaignId: campaign.id,
          milestoneIndex: Number(milestoneIndex),
          verifierSignedXDR: signedXDR,
          autoRelease,
        });
      } else {
        setStatus("verifying");
        await submitVerify(campaign.id, {
          campaignId: campaign.id,
          milestoneIndex: Number(milestoneIndex),
          demo: true,
          autoRelease,
        });
      }

      setStatus("done");
      setMessage(
        autoRelease
          ? `Milestone ${milestoneIndex} verified and released.`
          : `Milestone ${milestoneIndex} verified. Release separately when ready.`
      );
      toast.push("Milestone verified", "success");
      await loadCampaignDetail(campaign.id);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err.message || "Verification failed");
      toast.push("Verification failed", "error");
    }
  }

  async function handleRelease() {
    if (!campaign) return;
    setError(null);
    setMessage("");
    try {
      setStatus("releasing");
      await ensureAuthenticated();
      await submitRelease(campaign.id, {
        campaignId: campaign.id,
        milestoneIndex: Number(milestoneIndex),
        demo: !campaign.escrowAddress,
        amount: selected?.targetAmount ?? selected?.amount,
      });
      setStatus("done");
      setMessage(`Milestone ${milestoneIndex} funds released.`);
      toast.push("Milestone released", "success");
      await loadCampaignDetail(campaign.id);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err.message || "Release failed");
      toast.push("Release failed", "error");
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
            {user?.roles?.includes("ADMIN")
              ? "Admins can verify any ACTIVE campaign. NGOs see campaigns they own or belong to."
              : "Scoped to campaigns you own or belong to via a verified organization."}{" "}
            Submit delivery proof, verify on the bound escrow, then release as a separate step.
          </p>
        </div>
      </section>

      {campaigns.length === 0 && !error && (
        <p className="muted">No campaigns in your NGO scope yet.</p>
      )}

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
            Milestone
            <select
              id="verify-milestone"
              value={milestoneIndex}
              onChange={(e) => setMilestoneIndex(Number(e.target.value))}
            >
              {milestones.map((m) => (
                <option key={m.id || m.index} value={m.index ?? m.sequence}>
                  #{m.index ?? m.sequence}: {m.title || m.label} ($
                  {Number(m.targetAmount ?? m.amount ?? 0).toLocaleString()})
                </option>
              ))}
            </select>
          </label>

          <label className="input-label" htmlFor="proof-note">
            Proof of delivery note
            <textarea
              id="proof-note"
              rows={3}
              placeholder="Describe what was delivered and where"
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              maxLength={2000}
            />
          </label>

          <label className="input-label" htmlFor="evidence-url">
            Optional evidence URL
            <input
              id="evidence-url"
              type="url"
              placeholder="https://…"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
            />
          </label>

          <label className="input-label checkbox-row">
            <input
              type="checkbox"
              checked={autoRelease}
              onChange={(e) => setAutoRelease(e.target.checked)}
            />
            Also release funds immediately after verify
          </label>

          <p className="modal-copy">
            {campaign?.escrowAddress
              ? "Verification uses the campaign-bound escrow. Your wallet must be an allowlisted verifier."
              : "Demo path — no escrow bound. Actions update the local ledger and are labeled non-verified."}
          </p>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={handleSubmitProof}
              disabled={busy || !campaign}
            >
              Submit proof
            </button>
            <button type="button" onClick={handleVerify} disabled={busy || !campaign}>
              {status === "preparing" || status === "signing" || status === "verifying"
                ? "Verifying…"
                : "Verify milestone"}
            </button>
            {canRelease && (
              <button type="button" className="secondary" onClick={handleRelease} disabled={busy}>
                Release funds
              </button>
            )}
          </div>

          {message && <p className="message success">{message}</p>}
          {error && <p className="message error">{error}</p>}
        </section>

        <section className="panel">
          <h2>Current milestones</h2>
          <MilestoneTimeline milestones={milestones} proofs={proofs} />
        </section>
      </div>
    </div>
  );
}
