export default function CampaignCard({ campaign, onDonate }) {
  const { name, location, raised, goal, milestonesVerified, milestonesTotal } = campaign;
  const raisedValue = Number(raised);
  const pct = Math.min(100, Math.round((raisedValue / goal) * 100));
  const remaining = Math.max(0, goal - raisedValue);

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

      <div className="progress-row">
        <span className="progress-label">{pct}% funded</span>
        <span className="progress-label">${remaining.toLocaleString()} left</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="card-row">
        <div>
          <p className="stat-label">Raised</p>
          <strong>${raisedValue.toLocaleString()}</strong>
        </div>
        <div>
          <p className="stat-label">Goal</p>
          <strong>${goal.toLocaleString()}</strong>
        </div>
      </div>

      <button onClick={() => onDonate(campaign)}>Donate</button>
    </div>
  );
}
