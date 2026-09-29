export default function StatCard({ label, value, hint }) {
  return (
    <div className="panel compact stat-card">
      <p className="stat-label">{label}</p>
      <strong>{value}</strong>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  );
}
