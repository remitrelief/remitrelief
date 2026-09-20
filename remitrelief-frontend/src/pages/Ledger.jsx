import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchLedger, fetchStats } from "../lib/api";
import { shortenAddress } from "../lib/stellar";
import { Pagination } from "../components/CampaignUI";

const TYPES = [
  { value: "", label: "All events" },
  { value: "donation", label: "Donations" },
  { value: "verify", label: "Verifications" },
  { value: "release", label: "Releases" },
  { value: "campaign_created", label: "Campaigns created" },
];

const TRUST = [
  { value: "", label: "All sources" },
  { value: "true", label: "On-chain verified" },
  { value: "false", label: "Demo / app" },
];

export default function Ledger() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [stats, setStats] = useState(null);
  const [type, setType] = useState("");
  const [trust, setTrust] = useState("");
  const [page, setPage] = useState(1);
  const [campaignId, setCampaignId] = useState(searchParams.get("campaignId") || "");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fromUrl = searchParams.get("campaignId") || "";
    setCampaignId(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchLedger({
        limit: 25,
        page,
        type: type || undefined,
        campaignId: campaignId || undefined,
        verifiedOnChain: trust || undefined,
      }),
      fetchStats(),
    ])
      .then(([ledgerResult, s]) => {
        setEvents(ledgerResult.data || []);
        setMeta(ledgerResult.meta || { page, totalPages: 1 });
        setStats(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [type, campaignId, trust, page]);

  function applyCampaignFilter(value) {
    const next = value.trim();
    setCampaignId(next);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("campaignId", next);
    else params.delete("campaignId");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Public transparency</p>
          <h1>Relief ledger</h1>
          <p className="hero-copy">
            Donations, verifications, and releases. Events marked{" "}
            <strong>on-chain verified</strong> were confirmed against Soroban (or indexed from
            chain). Demo/app events are local development records and are not blockchain proof.
          </p>
        </div>
      </section>

      {stats && (
        <div className="stat-grid dashboard-stats">
          <div className="panel compact">
            <p className="stat-label">On-chain ledger events</p>
            <strong>{stats.onChainLedgerEvents ?? 0}</strong>
          </div>
          <div className="panel compact">
            <p className="stat-label">Demo / app events</p>
            <strong>{stats.demoLedgerEvents ?? 0}</strong>
          </div>
          <div className="panel compact">
            <p className="stat-label">Verified donations</p>
            <strong>{stats.donationsCount}</strong>
          </div>
          <div className="panel compact">
            <p className="stat-label">Released</p>
            <strong>${Number(stats.amountReleased).toLocaleString()}</strong>
          </div>
        </div>
      )}

      <div className="filter-bar ledger-filters">
        <div className="chip-row filter-chips" role="group" aria-label="Event type">
          {TYPES.map((t) => (
            <button
              key={t.value || "all"}
              type="button"
              className={`chip ${type === t.value ? "active" : ""}`}
              onClick={() => {
                setType(t.value);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="chip-row filter-chips" role="group" aria-label="Trust source">
          {TRUST.map((t) => (
            <button
              key={t.value || "trust-all"}
              type="button"
              className={`chip ${trust === t.value ? "active" : ""}`}
              onClick={() => {
                setTrust(t.value);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="input-label campaign-filter">
          Campaign ID
          <input
            value={campaignId}
            placeholder="Filter by campaign id or slug"
            onChange={(event) => applyCampaignFilter(event.target.value)}
          />
        </label>
        {campaignId && (
          <button
            type="button"
            className="secondary compact"
            onClick={() => applyCampaignFilter("")}
          >
            Clear campaign filter
          </button>
        )}
      </div>

      {loading && <p className="muted">Loading ledger…</p>}
      {error && <div className="message error">{error}</div>}

      {!loading && !error && (
        <section className="panel">
          {events.length === 0 ? (
            <p className="muted">No events for this filter.</p>
          ) : (
            <ul className="ledger-list">
              {events.map((e) => (
                <li key={e.id} className={`ledger-item ledger-${e.type}`}>
                  <div className="ledger-badge">{e.type.replace("_", " ")}</div>
                  <div className="ledger-body">
                    <h3>
                      <Link to={`/campaign/${e.campaignId}`}>{e.campaignName}</Link>
                    </h3>
                    <p>{e.note}</p>
                    {e.proofNote && <p className="proof-note">Proof: {e.proofNote}</p>}
                    <div className="ledger-meta">
                      <span
                        className={`status-pill ${
                          e.verifiedOnChain ? "status-released" : "status-pending"
                        }`}
                      >
                        {e.verifiedOnChain ? "on-chain verified" : "demo / app event"}
                      </span>
                      {e.amount != null && <span>${Number(e.amount).toLocaleString()}</span>}
                      {e.actor && <span>{shortenAddress(e.actor, 4)}</span>}
                      {e.txHash && (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View tx
                        </a>
                      )}
                      <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={meta.page || page}
            totalPages={meta.totalPages || 1}
            onPageChange={setPage}
          />
        </section>
      )}
    </div>
  );
}
