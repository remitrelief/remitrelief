import { useEffect, useState } from "react";
import CampaignCard from "../components/CampaignCard";
import DonateModal from "../components/DonateModal";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/campaigns`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load campaigns");
        return r.json();
      })
      .then(setCampaigns)
      .catch((err) => {
        console.error(err);
        setError("Unable to load campaigns. Please try again later.");
      });
  }, []);

  function handleDonationSuccess(campaignId, donatedAmount) {
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === campaignId
          ? { ...campaign, raised: Number(campaign.raised) + Number(donatedAmount) }
          : campaign
      )
    );
    setSelected((current) =>
      current && current.id === campaignId
        ? { ...current, raised: Number(current.raised) + Number(donatedAmount) }
        : current
    );
  }

  const totalRaised = campaigns.reduce((sum, campaign) => sum + Number(campaign.raised), 0);
  const totalGoal = campaigns.reduce((sum, campaign) => sum + Number(campaign.goal), 0);

  return (
    <div className="campaign-list">
      <section className="hero-card">
        <div className="hero-copy-block">
          <p className="eyebrow">Community escrow for relief</p>
          <h1>Fund trusted campaigns with milestone-protected donations.</h1>
          <p className="hero-copy">
            RemitRelief connects donors, relief organizers, and verified milestones on the Stellar network. Your gift is held in escrow and released only after delivery is confirmed.
          </p>
          <div className="hero-actions">
            <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>
              Explore campaigns
            </button>
            <a href="https://developers.stellar.org/docs/" target="_blank" rel="noreferrer">
              Learn about Stellar
            </a>
          </div>
        </div>
        <div className="hero-summary">
          <div className="hero-stat-card">
            <span className="stat-label">Total funds secured</span>
            <strong>${totalRaised.toLocaleString()}</strong>
          </div>
          <div className="hero-stat-card">
            <span className="stat-label">Verified payout stages</span>
            <strong>{campaigns.reduce((sum, campaign) => sum + Number(campaign.milestonesVerified || 0), 0)}</strong>
          </div>
          <div className="hero-stat-card">
            <span className="stat-label">Campaigns active</span>
            <strong>{campaigns.length}</strong>
          </div>
          <div className="hero-stat-card hero-note">
            <p>Each donation is routed through an escrow contract. Release events only occur after proof of milestone completion.</p>
          </div>
        </div>
      </section>

      <section className="feature-strip">
        <div>
          <h2>Built for transparent impact</h2>
          <p>
            RemitRelief makes relief funding more accountable by combining Stellar smart contracts, milestone verification, and donor-friendly tracking. Every campaign is designed to protect funds until work is completed.
          </p>
        </div>
        <div className="feature-grid">
          <div className="feature-card">
            <h3>Escrow protection</h3>
            <p>Funds stay in contract until each milestone passes verification, reducing risk for donors and beneficiaries.</p>
          </div>
          <div className="feature-card">
            <h3>Milestone transparency</h3>
            <p>Follow campaign progress with verified milestone counts and live funding status for every project.</p>
          </div>
          <div className="feature-card">
            <h3>Stellar-native payments</h3>
            <p>Donations use Stellar-backed assets so transfers are fast, low-cost, and globally accessible.</p>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="how-copy">
          <h2>How donation escrow works</h2>
          <p>
            Donors contribute in USD using Stellar assets, and funds are held in the campaign escrow contract. Every payout is gated by milestones, so money only moves when delivery is verified.
          </p>
        </div>
        <div className="steps-grid">
          <div className="step-card">
            <span className="step-label">1</span>
            <h3>Select a campaign</h3>
            <p>Choose a relief effort and review verified milestones before donating.</p>
          </div>
          <div className="step-card">
            <span className="step-label">2</span>
            <h3>Donate securely</h3>
            <p>Send funds through Stellar, where they are placed into an escrow contract automatically.</p>
          </div>
          <div className="step-card">
            <span className="step-label">3</span>
            <h3>Release after verification</h3>
            <p>Funds are released to the campaign only after the on-chain milestone verification process completes.</p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="message error">{error}</div>
      ) : (
        <div className="grid">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} onDonate={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <DonateModal campaign={selected} onClose={() => setSelected(null)} onSuccess={handleDonationSuccess} />
      )}
    </div>
  );
}
