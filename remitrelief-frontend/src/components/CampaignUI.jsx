import { Link } from "react-router-dom";

export const CAMPAIGN_CATEGORIES = [
  "MEDICAL",
  "EDUCATION",
  "FOOD",
  "HOUSING",
  "EMERGENCY",
  "DISASTER",
  "FAMILY",
  "COMMUNITY",
];

export function campaignTitle(campaign) {
  return campaign?.title || campaign?.name || "Untitled campaign";
}

export function Money({ value = 0, currency = "USDC", compact = false }) {
  const amount = Number(value) || 0;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency === "USDC" ? "USD" : currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(amount);
  return <span>{currency === "USDC" ? `${formatted} USDC` : formatted}</span>;
}

export function CampaignBadge({ value, kind = "status" }) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().replaceAll("_", "-");
  return (
    <span className={`campaign-badge ${kind}-${normalized}`}>
      {String(value).replaceAll("_", " ")}
    </span>
  );
}

export function CampaignProgress({ raised = 0, goal = 0, percentage, currency = "USDC" }) {
  const calculated = Number(goal) > 0 ? (Number(raised) / Number(goal)) * 100 : 0;
  const progress = Math.max(0, Math.min(100, Number(percentage ?? calculated) || 0));
  return (
    <div className="campaign-progress">
      <div className="progress-row">
        <strong>{Math.round(progress)}% funded</strong>
        <span>
          <Money value={raised} currency={currency} /> of{" "}
          <Money value={goal} currency={currency} />
        </span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-label="Campaign funding progress"
        aria-valuenow={Math.round(progress)}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function Deadline({ value }) {
  if (!value) return <span>No deadline</span>;
  const date = new Date(value);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const label = days < 0 ? "Ended" : days === 0 ? "Ends today" : `${days} days left`;
  return (
    <span>
      {label} · <time dateTime={date.toISOString()}>{date.toLocaleDateString()}</time>
    </span>
  );
}

export function LoadingState({ label = "Loading campaigns…" }) {
  return <p className="state-panel" role="status">{label}</p>;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-panel error" role="alert">
      <p>{message || "Something went wrong."}</p>
      {onRetry && <button type="button" className="secondary compact" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", children }) {
  return (
    <div className="state-panel">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Campaign pages">
      <button type="button" className="secondary compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span>Page {page} of {totalPages}</span>
      <button type="button" className="secondary compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function ShareLinks({ title }) {
  const url = typeof window === "undefined" ? "" : window.location.href;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return (
    <div className="share-links" aria-label="Share campaign">
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer">Facebook</a>
      <a href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`} target="_blank" rel="noreferrer">X</a>
      <a href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(url)}>Copy link</button>
    </div>
  );
}

export function CampaignFilters({ values, onChange }) {
  return (
    <form className="campaign-filters" onSubmit={(event) => event.preventDefault()}>
      <label>
        <span>Search</span>
        <input type="search" value={values.search} onChange={(event) => onChange("search", event.target.value)} placeholder="Search campaigns" />
      </label>
      <label>
        <span>Category</span>
        <select value={values.category} onChange={(event) => onChange("category", event.target.value)}>
          <option value="">All categories</option>
          {CAMPAIGN_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label>
        <span>Sort by</span>
        <select value={values.sort} onChange={(event) => onChange("sort", event.target.value)}>
          <option value="newest">Newest</option>
          <option value="ending_soon">Ending soon</option>
          <option value="progress">Progress</option>
          <option value="goal_high">Highest goal</option>
          <option value="goal_low">Lowest goal</option>
        </select>
      </label>
    </form>
  );
}

export function ManageLink({ campaign }) {
  return campaign?.capabilities && Object.values(campaign.capabilities).some(Boolean) ? (
    <Link className="secondary-link" to={`/dashboard/campaigns/${campaign.id}`}>Manage</Link>
  ) : null;
}
