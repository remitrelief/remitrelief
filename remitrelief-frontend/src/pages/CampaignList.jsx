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

  return (
    <div className="campaign-list">
      <div className="hero-card">
        <div>
          <p className="eyebrow">Community escrow for relief</p>
          <h1>Supporting impact campaigns through transparent on-chain escrow.</h1>
          <p className="hero-copy">
            Donate safely with real-time on-chain milestone verification, and watch how funds are released only after delivery is confirmed.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>
            View campaigns
          </button>
          <a href="https://developers.stellar.org/docs/" target="_blank" rel="noreferrer">
            Learn more
          </a>
        </div>
      </div>

      {error ? (
        <div className="message error">{error}</div>
      ) : (
        <div className="grid">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onDonate={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <DonateModal campaign={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
