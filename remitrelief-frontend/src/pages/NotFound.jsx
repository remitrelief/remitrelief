import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="page">
      <section className="panel empty-panel not-found">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="muted">That route doesn’t exist in RemitRelief.</p>
        <Link className="secondary-link" to="/">
          Back to campaigns
        </Link>
      </section>
    </div>
  );
}
