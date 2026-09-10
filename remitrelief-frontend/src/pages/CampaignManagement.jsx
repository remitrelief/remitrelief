import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CampaignForm from "../components/CampaignForm";
import {
  CampaignBadge,
  ErrorState,
  LoadingState,
  campaignTitle,
} from "../components/CampaignUI";
import {
  addCampaignMedia,
  createCampaignUpdate,
  deleteCampaign,
  deleteCampaignMedia,
  fetchCampaign,
  submitCampaign,
  transitionCampaign,
  updateCampaign,
} from "../lib/api";
import { useToast } from "../context/ToastContext";

const NEXT_STATUSES = {
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "EXPIRED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
};

export default function CampaignManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateDraft, setUpdateDraft] = useState({ title: "", content: "" });
  const [mediaDraft, setMediaDraft] = useState({ url: "", altText: "", type: "IMAGE" });
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCampaign(await fetchCampaign(id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function run(action, message) {
    setError("");
    try {
      await action();
      toast.push(message, "success");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading) return <div className="page"><LoadingState label="Loading campaign workspace…" /></div>;
  if (error && !campaign) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!campaign) return null;

  const capabilities = campaign.capabilities || {};

  return (
    <div className="page">
      <Link className="back-link" to="/dashboard/campaigns">← My campaigns</Link>
      <section className="page-header management-header">
        <div><p className="eyebrow">Campaign management</p><h1>{campaignTitle(campaign)}</h1><CampaignBadge value={campaign.status} /></div>
        <Link className="secondary-link" to={`/campaign/${campaign.slug || campaign.id}`}>View public page</Link>
      </section>
      {error && <p className="message error" role="alert">{error}</p>}

      {capabilities.canEdit && <CampaignForm
        campaign={campaign}
        storageKey={`campaign-${campaign.id}`}
        onSave={(payload) => run(() => updateCampaign(campaign.id, payload), "Draft saved")}
        onSubmit={async (payload) => {
          await updateCampaign(campaign.id, payload);
          await submitCampaign(campaign.id);
          toast.push("Campaign submitted for review", "success");
          await load();
        }}
      />}

      {!capabilities.canEdit && <section className="panel"><h2>Campaign fields are locked</h2><p className="muted">Only draft campaigns can be edited. Available actions are shown below.</p></section>}

      <section className="panel">
        <h2>Lifecycle actions</h2>
        <div className="management-actions">
          {capabilities.canSubmit && <button type="button" onClick={() => run(() => submitCampaign(campaign.id), "Campaign submitted")}>Submit for review</button>}
          {capabilities.canDelete && <button type="button" className="danger-button" onClick={async () => {
            if (!window.confirm("Delete this draft permanently?")) return;
            await deleteCampaign(campaign.id);
            navigate("/dashboard/campaigns");
          }}>Delete draft</button>}
          {capabilities.canModerate && (NEXT_STATUSES[campaign.status] || []).map((status) => <button key={status} type="button" className="secondary" onClick={() => run(() => transitionCampaign(campaign.id, status, status === "REJECTED" ? reason : undefined), `Campaign moved to ${status.toLowerCase()}`)}>{status.replaceAll("_", " ")}</button>)}
        </div>
        {capabilities.canModerate && NEXT_STATUSES[campaign.status]?.includes("REJECTED") && <label className="input-label moderation-reason">Rejection reason<input value={reason} onChange={(event) => setReason(event.target.value)} minLength="5" /></label>}
      </section>

      {capabilities.canPostUpdate && <section className="panel">
        <h2>Publish an update</h2>
        <div className="form-grid">
          <label className="input-label">Title<input value={updateDraft.title} onChange={(event) => setUpdateDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="input-label full">Content<textarea rows="5" value={updateDraft.content} onChange={(event) => setUpdateDraft((current) => ({ ...current, content: event.target.value }))} /></label>
        </div>
        <button type="button" onClick={() => run(async () => {
          await createCampaignUpdate(campaign.id, { ...updateDraft, publish: true });
          setUpdateDraft({ title: "", content: "" });
        }, "Update published")}>Publish update</button>
      </section>}

      {capabilities.canEdit && <section className="panel">
        <h2>Campaign media</h2>
        <div className="form-grid">
          <label className="input-label">Media URL<input type="url" value={mediaDraft.url} onChange={(event) => setMediaDraft((current) => ({ ...current, url: event.target.value }))} /></label>
          <label className="input-label">Alt text<input value={mediaDraft.altText} onChange={(event) => setMediaDraft((current) => ({ ...current, altText: event.target.value }))} /></label>
          <label className="input-label">Type<select value={mediaDraft.type} onChange={(event) => setMediaDraft((current) => ({ ...current, type: event.target.value }))}><option>IMAGE</option><option>VIDEO</option><option>DOCUMENT</option></select></label>
        </div>
        <button type="button" onClick={() => run(async () => {
          await addCampaignMedia(campaign.id, mediaDraft);
          setMediaDraft({ url: "", altText: "", type: "IMAGE" });
        }, "Media added")}>Add media</button>
        <ul className="media-management">{(campaign.media || []).map((item) => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.altText || item.url}</a><button type="button" className="secondary compact" onClick={() => run(() => deleteCampaignMedia(campaign.id, item.id), "Media removed")}>Remove</button></li>)}</ul>
      </section>}
    </div>
  );
}
