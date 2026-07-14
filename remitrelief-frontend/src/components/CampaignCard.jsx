export default function CampaignCard({ campaign, onDonate }) {
  const { name, location, raised, goal, milestonesVerified, milestonesTotal } = campaign;
  const pct = Math.min(100, Math.round((raised / goal) * 100));

  return (
    <div className="campaign-card">
      <div className="campaign-header">
        <div>
          <p className="eyebrow">Campaign</p>
          <h3>{name}</h3>
        </div>
        <span className="badge">{milestonesVerified}/{milestonesTotal} verified</span>
      </div>
      <p className="location">{location}</p>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="card-row">
        <p className="stat">
          <strong>${raised.toLocaleString()}</strong>
          <span>raised</span>
        </p>
        <p className="stat">
          <strong>${goal.toLocaleString()}</strong>
          <span>goal</span>
        </p>
      </div>
      <button onClick={() => onDonate(campaign)}>Donate</button>
    </div>
  );
}
