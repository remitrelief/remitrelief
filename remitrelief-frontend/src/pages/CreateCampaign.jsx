import { useNavigate } from "react-router-dom";
import CampaignForm from "../components/CampaignForm";
import { createCampaign, submitCampaign } from "../lib/api";
import { useToast } from "../context/ToastContext";

export default function CreateCampaign() {
  const navigate = useNavigate();
  const toast = useToast();

  async function saveDraft(payload) {
    const campaign = await createCampaign(payload);
    toast.push("Campaign draft saved", "success");
    navigate(`/dashboard/campaigns/${campaign.id}`);
  }

  async function createAndSubmit(payload) {
    const campaign = await createCampaign(payload);
    await submitCampaign(campaign.id);
    toast.push("Campaign submitted for review", "success");
    navigate(`/dashboard/campaigns/${campaign.id}`);
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Organizers</p>
          <h1>Create a relief campaign</h1>
          <p className="hero-copy">
            Define the goal, recipient, and milestone tranches. Donations escrow until each stage is
            verified.
          </p>
        </div>
      </section>

      <CampaignForm onSave={saveDraft} onSubmit={createAndSubmit} />
    </div>
  );
}
