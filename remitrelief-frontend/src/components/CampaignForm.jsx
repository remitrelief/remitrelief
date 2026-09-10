import { useEffect, useMemo, useState } from "react";
import { CAMPAIGN_CATEGORIES, Money } from "./CampaignUI";

const STEPS = ["Basics", "Funding", "Milestones", "Review"];
const EMPTY_MILESTONE = { title: "", description: "", targetAmount: "" };

function campaignToForm(campaign) {
  return {
    title: campaign?.title || campaign?.name || "",
    shortDescription: campaign?.shortDescription || "",
    description: campaign?.description || "",
    location: campaign?.location || "",
    category: campaign?.category || "EMERGENCY",
    goalAmount: campaign?.goalAmount || "",
    currency: campaign?.currency || "USDC",
    deadline: campaign?.deadline ? campaign.deadline.slice(0, 10) : "",
    visibility: campaign?.visibility || "PUBLIC",
    coverImage: campaign?.coverImage || "",
    recipientId: campaign?.recipient?.id || campaign?.recipientId || "",
    organizationId: campaign?.organization?.id || campaign?.organizationId || "",
  };
}

export default function CampaignForm({ campaign, storageKey = "campaign-draft", onSave, onSubmit }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => {
    if (campaign) return campaignToForm(campaign);
    try {
      return JSON.parse(localStorage.getItem(storageKey))?.form || campaignToForm();
    } catch {
      return campaignToForm();
    }
  });
  const [milestones, setMilestones] = useState(() => {
    if (campaign?.milestones?.length) return campaign.milestones.map((item) => ({
      id: item.id,
      title: item.title || item.label || "",
      description: item.description || "",
      targetAmount: item.targetAmount || item.amountUsd || "",
    }));
    try {
      return JSON.parse(localStorage.getItem(storageKey))?.milestones || [{ ...EMPTY_MILESTONE }];
    } catch {
      return [{ ...EMPTY_MILESTONE }];
    }
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!campaign && dirty) localStorage.setItem(storageKey, JSON.stringify({ form, milestones }));
  }, [campaign, dirty, form, milestones, storageKey]);

  useEffect(() => {
    const protect = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  const milestoneTotal = useMemo(
    () => milestones.reduce((sum, item) => sum + (Number(item.targetAmount) || 0), 0),
    [milestones]
  );

  function updateField(name, value) {
    setDirty(true);
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateMilestone(index, name, value) {
    setDirty(true);
    setMilestones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [name]: value } : item));
  }

  function payload() {
    return {
      ...form,
      coverImage: form.coverImage || null,
      recipientId: form.recipientId || undefined,
      organizationId: form.organizationId || undefined,
      deadline: form.deadline ? new Date(`${form.deadline}T23:59:59`).toISOString() : null,
      milestones: milestones.filter((item) => item.title.trim() && Number(item.targetAmount) > 0).map((item, sequence) => ({
        ...(item.id ? { id: item.id } : {}),
        title: item.title.trim(),
        description: item.description.trim(),
        targetAmount: String(item.targetAmount),
        sequence,
      })),
    };
  }

  function validateForSubmit() {
    if (form.title.trim().length < 5) return "Title must be at least 5 characters.";
    if (form.description.trim().length < 30) return "Description must be at least 30 characters.";
    if (!form.recipientId) return "A registered recipient ID is required.";
    if (!form.deadline || new Date(form.deadline).getTime() <= Date.now()) return "Choose a future deadline.";
    if (!Number(form.goalAmount)) return "Enter a funding goal.";
    if (!milestones.some((item) => item.title.trim())) return "Add at least one milestone.";
    if (milestoneTotal !== Number(form.goalAmount)) return "Milestone amounts must equal the campaign goal.";
    return "";
  }

  async function run(action, validate = false) {
    const validationError = validate ? validateForSubmit() : "";
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action(payload());
      setDirty(false);
      localStorage.removeItem(storageKey);
    } catch (requestError) {
      setError(requestError.message || "Unable to save campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="campaign-wizard">
      <ol className="wizard-steps" aria-label="Campaign form progress">
        {STEPS.map((label, index) => <li key={label} className={index === step ? "active" : index < step ? "complete" : ""}>{index + 1}. {label}</li>)}
      </ol>
      <form className="panel form-panel" onSubmit={(event) => event.preventDefault()}>
        {step === 0 && <fieldset>
          <legend>Campaign basics</legend>
          <div className="form-grid">
            <Field label="Title" value={form.title} onChange={(value) => updateField("title", value)} required maxLength={120} />
            <Field label="Location" value={form.location} onChange={(value) => updateField("location", value)} maxLength={120} />
            <label className="input-label">Category<select value={form.category} onChange={(event) => updateField("category", event.target.value)}>{CAMPAIGN_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="input-label">Visibility<select value={form.visibility} onChange={(event) => updateField("visibility", event.target.value)}><option>PUBLIC</option><option>UNLISTED</option><option>PRIVATE</option></select></label>
            <Field className="full" label="Short description" value={form.shortDescription} onChange={(value) => updateField("shortDescription", value)} maxLength={240} />
            <label className="input-label full">Full description<textarea rows="8" value={form.description} onChange={(event) => updateField("description", event.target.value)} maxLength={10000} /></label>
          </div>
        </fieldset>}

        {step === 1 && <fieldset>
          <legend>Funding and ownership</legend>
          <div className="form-grid">
            <Field label="Goal amount" type="number" min="1" value={form.goalAmount} onChange={(value) => updateField("goalAmount", value)} required />
            <label className="input-label">Currency<select value={form.currency} onChange={(event) => updateField("currency", event.target.value)}>{["USDC", "USD", "NGN", "EUR", "GBP"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <Field label="Deadline" type="date" value={form.deadline} onChange={(value) => updateField("deadline", value)} />
            <Field label="Recipient user ID" value={form.recipientId} onChange={(value) => updateField("recipientId", value)} />
            <Field label="Organization ID (optional)" value={form.organizationId} onChange={(value) => updateField("organizationId", value)} />
            <Field className="full" label="Cover image URL" type="url" value={form.coverImage} onChange={(value) => updateField("coverImage", value)} />
          </div>
        </fieldset>}

        {step === 2 && <fieldset>
          <legend>Milestones</legend>
          <p className="muted">Total: <Money value={milestoneTotal} currency={form.currency} /> of <Money value={form.goalAmount} currency={form.currency} /></p>
          {milestones.map((item, index) => <div className="milestone-form" key={item.id || index}>
            <Field label={`Milestone ${index + 1} title`} value={item.title} onChange={(value) => updateMilestone(index, "title", value)} />
            <Field label="Target amount" type="number" min="0.01" step="0.01" value={item.targetAmount} onChange={(value) => updateMilestone(index, "targetAmount", value)} />
            <label className="input-label full">Description<textarea rows="3" value={item.description} onChange={(event) => updateMilestone(index, "description", event.target.value)} /></label>
            <button type="button" className="secondary compact" disabled={milestones.length === 1} onClick={() => { setDirty(true); setMilestones((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}>Remove</button>
          </div>)}
          <button type="button" className="secondary compact" onClick={() => { setDirty(true); setMilestones((current) => [...current, { ...EMPTY_MILESTONE }]); }}>Add milestone</button>
        </fieldset>}

        {step === 3 && <fieldset>
          <legend>Review campaign</legend>
          <div className="review-grid">
            <div><span>Title</span><strong>{form.title || "Not provided"}</strong></div>
            <div><span>Goal</span><strong><Money value={form.goalAmount} currency={form.currency} /></strong></div>
            <div><span>Deadline</span><strong>{form.deadline || "Not provided"}</strong></div>
            <div><span>Visibility</span><strong>{form.visibility}</strong></div>
            <div className="full"><span>Description</span><p>{form.description || "Not provided"}</p></div>
            <div className="full"><span>Milestones</span><strong>{milestones.length} totaling <Money value={milestoneTotal} currency={form.currency} /></strong></div>
          </div>
        </fieldset>}

        {error && <p className="message error" role="alert">{error}</p>}
        <div className="wizard-actions">
          <button type="button" className="secondary" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}>Back</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => run(onSave)}>Save draft</button>
          {step < STEPS.length - 1 ? <button type="button" disabled={busy} onClick={() => setStep((current) => current + 1)}>Continue</button> : onSubmit && <button type="button" disabled={busy} onClick={() => run(onSubmit, true)}>Submit for review</button>}
        </div>
      </form>
    </div>
  );
}

function Field({ label, className = "", onChange, ...props }) {
  return <label className={`input-label ${className}`}>{label}<input {...props} onChange={(event) => onChange(event.target.value)} /></label>;
}
