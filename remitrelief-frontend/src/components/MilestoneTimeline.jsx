export default function MilestoneTimeline({ milestones = [], proofs = [] }) {
  if (!milestones.length) {
    return <p className="muted">No milestone data available yet.</p>;
  }

  const proofsByIndex = proofs.reduce((acc, proof) => {
    const key = Number(proof.milestoneIndex);
    if (!acc[key]) acc[key] = [];
    acc[key].push(proof);
    return acc;
  }, {});

  return (
    <ol className="milestone-timeline">
      {milestones.map((m, index) => {
        const milestoneIndex = m.index ?? m.sequence ?? index;
        const released = Boolean(m.released || m.status === "RELEASED");
        const verified = Boolean(m.verified || m.status === "VERIFIED" || m.status === "COMPLETED");
        const state = released ? "released" : verified ? "verified" : "pending";
        const latestProof = (proofsByIndex[Number(milestoneIndex)] || [])[0];
        return (
          <li
            key={m.id || milestoneIndex}
            className={`milestone-item milestone-${state}`}
          >
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
              {latestProof && (
                <p className="muted proof-snippet">
                  Proof: {latestProof.note.slice(0, 120)}
                  {latestProof.note.length > 120 ? "…" : ""}
                </p>
              )}
              {m.verifyTxHash && (
                <p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${m.verifyTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify tx
                  </a>
                </p>
              )}
              {m.releaseTxHash && (
                <p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${m.releaseTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Release tx
                  </a>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
