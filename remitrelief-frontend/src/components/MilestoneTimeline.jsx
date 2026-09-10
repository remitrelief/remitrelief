export default function MilestoneTimeline({ milestones = [] }) {
  if (!milestones.length) {
    return <p className="muted">No milestone data available yet.</p>;
  }

  return (
    <ol className="milestone-timeline">
      {milestones.map((m, index) => {
        const state = m.released || m.status === "RELEASED" ? "released" : m.verified || m.status === "VERIFIED" ? "verified" : "pending";
        return (
          <li key={m.id || m.index || index} className={`milestone-item milestone-${state}`}>
            <div className="milestone-marker" aria-hidden="true" />
            <div className="milestone-content">
              <div className="milestone-top">
                <h4>{m.title || m.label || `Milestone ${index + 1}`}</h4>
                <span className={`status-pill status-${state}`}>{state}</span>
              </div>
              <p>
                Tranche:{" "}
                <strong>
                  $
                  {Number(m.targetAmount ?? m.amountUsd ?? m.amount ?? 0).toLocaleString()}
                </strong>
              </p>
              {m.description && <p>{m.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
