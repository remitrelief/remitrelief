import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CampaignBadge,
  ErrorState,
  LoadingState,
  campaignTitle,
} from "../components/CampaignUI";
import {
  fetchAdminAudits,
  fetchAdminIndexer,
  fetchModerationQueue,
  fetchPendingOrganizations,
  runAdminIndexer,
  setOrganizationStatus,
  transitionCampaign,
} from "../lib/api";
import { useToast } from "../context/ToastContext";

const NEXT = {
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "CANCELLED"],
};

export default function AdminDashboard() {
  const toast = useToast();
  const [queue, setQueue] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [audits, setAudits] = useState([]);
  const [indexer, setIndexer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [indexerBusy, setIndexerBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [queueResult, pendingOrgs, auditResult, indexerResult] = await Promise.all([
        fetchModerationQueue({ limit: 50 }),
        fetchPendingOrganizations().catch(() => []),
        fetchAdminAudits({ limit: 30 }).catch(() => []),
        fetchAdminIndexer().catch(() => null),
      ]);
      setQueue(queueResult.data || []);
      setOrgs(Array.isArray(pendingOrgs) ? pendingOrgs : []);
      setAudits(Array.isArray(auditResult) ? auditResult : []);
      setIndexer(indexerResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, message) {
    try {
      await action();
      toast.push(message, "success");
      await load();
    } catch (err) {
      setError(err.message);
      toast.push(err.message || "Action failed", "error");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading admin workspace…" />
      </div>
    );
  }
  if (error && !queue.length) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Operator workspace</h1>
          <p className="hero-copy">
            Review campaigns, verify organizations (status only — not KYC), and inspect recent
            audits.
          </p>
        </div>
      </section>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2>Moderation queue</h2>
        {queue.length === 0 ? (
          <p className="muted">No campaigns awaiting review.</p>
        ) : (
          <ul className="admin-queue">
            {queue.map((campaign) => (
              <li key={campaign.id}>
                <div>
                  <Link to={`/dashboard/campaigns/${campaign.id}`}>
                    {campaignTitle(campaign)}
                  </Link>
                  <CampaignBadge value={campaign.status} />
                  {!campaign.escrowAddress && campaign.status === "APPROVED" && (
                    <span className="muted"> · escrow not bound</span>
                  )}
                </div>
                <div className="management-actions">
                  {(NEXT[campaign.status] || []).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="secondary compact"
                      onClick={() =>
                        run(
                          () =>
                            transitionCampaign(campaign.id, status, {
                              reason: status === "REJECTED" ? reason || "Needs revision" : undefined,
                            }),
                          `Moved to ${status}`
                        )
                      }
                    >
                      {status.replaceAll("_", " ")}
                    </button>
                  ))}
                  <Link className="ghost-link" to={`/campaign/${campaign.slug || campaign.id}`}>
                    Public
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <label className="input-label">
          Rejection reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </section>

      <section className="panel">
        <h2>Pending organizations</h2>
        {orgs.length === 0 ? (
          <p className="muted">No organizations awaiting verification.</p>
        ) : (
          <ul className="admin-queue">
            {orgs.map((org) => (
              <li key={org.id}>
                <div>
                  <strong>{org.name}</strong>
                  <span className="muted"> · {org.slug}</span>
                </div>
                <div className="management-actions">
                  <button
                    type="button"
                    className="compact"
                    onClick={() =>
                      run(() => setOrganizationStatus(org.id, "VERIFIED"), "Organization verified")
                    }
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() =>
                      run(() => setOrganizationStatus(org.id, "REJECTED"), "Organization rejected")
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Indexer status</h2>
        {indexer ? (
          <>
            <p>
              Escrow campaigns tracked: <strong>{indexer.escrowCampaigns || 0}</strong>
            </p>
            {indexer.lastRun && (
              <p className="muted">
                Last run: scanned {indexer.lastRun.scanned}, appended {indexer.lastRun.appended},
                duplicates {indexer.lastRun.duplicates}
                {indexer.lastRun.finishedAt
                  ? ` · ${new Date(indexer.lastRun.finishedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
            <div className="management-actions">
              <button
                type="button"
                className="compact"
                disabled={indexerBusy}
                onClick={() =>
                  run(async () => {
                    setIndexerBusy(true);
                    try {
                      await runAdminIndexer({});
                    } finally {
                      setIndexerBusy(false);
                    }
                  }, "Indexer run complete")
                }
              >
                {indexerBusy ? "Running…" : "Run indexer"}
              </button>
              <button
                type="button"
                className="secondary compact"
                disabled={indexerBusy}
                onClick={() =>
                  run(async () => {
                    setIndexerBusy(true);
                    try {
                      await runAdminIndexer({ backfill: true });
                    } finally {
                      setIndexerBusy(false);
                    }
                  }, "Indexer backfill complete")
                }
              >
                Backfill (reset cursors)
              </button>
            </div>
            {indexer.cursors?.length > 0 && (
              <ul className="admin-queue">
                {indexer.cursors.slice(0, 8).map((row) => (
                  <li key={row.campaignId}>
                    <div>
                      <code>{row.campaignId}</code>
                      <span className="muted"> · cursor {row.cursor || "none"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted">Indexer status unavailable.</p>
        )}
      </section>

      <section className="panel">
        <h2>Recent audits</h2>
        {audits.length === 0 ? (
          <p className="muted">No audit events yet.</p>
        ) : (
          <ul className="ledger-list">
            {audits.map((item) => (
              <li key={item.id} className="ledger-item">
                <div className="ledger-badge">{item.action}</div>
                <div className="ledger-body">
                  <p>
                    {item.resourceType || "Resource"} {item.resourceId || ""}
                  </p>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
