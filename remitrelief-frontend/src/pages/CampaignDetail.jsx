import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DonateModal from "../components/DonateModal";
import EscrowStatus from "../components/EscrowStatus";
import MilestoneTimeline from "../components/MilestoneTimeline";
import {
  CampaignBadge,
  CampaignProgress,
  Deadline,
  EmptyState,
  ErrorState,
  LoadingState,
  Money,
  ShareLinks,
  campaignTitle,
} from "../components/CampaignUI";
import {
  fetchCampaign,
  fetchCampaignUpdates,
  fetchLedger,
  fetchMilestoneProofs,
} from "../lib/api";
import { shortenAddress } from "../lib/stellar";

export default function CampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [events, setEvents] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [error, setError] = useState(null);
  const [donateOpen, setDonateOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignResult, updateResult, ledgerResult, proofResult] = await Promise.all([
        fetchCampaign(id),
        fetchCampaignUpdates(id).catch(() => []),
        fetchLedger({ campaignId: id, limit: 30 }).catch(() => ({ data: [] })),
        fetchMilestoneProofs(id).catch(() => []),
      ]);
      setCampaign(campaignResult);
      setUpdates(updateResult || campaignResult.updates || []);
      setEvents(Array.isArray(ledgerResult?.data) ? ledgerResult.data : []);
      setProofs(Array.isArray(proofResult) ? proofResult : []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDonationSuccess(_campaignId, donatedAmount) {
    setCampaign((prev) =>
      prev
        ? {
            ...prev,
            raisedAmount: String(Number(prev.raisedAmount) + Number(donatedAmount)),
          }
        : prev
    );
    load();
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading campaign…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!campaign) return null;

  const title = campaignTitle(campaign);
  const active = (campaign.effectiveStatus || campaign.status) === "ACTIVE";
  const hasEscrow = Boolean(campaign.escrowAddress);
  const media = [campaign.coverImage, ...(campaign.media || []).map((item) => item.url)].filter(
    Boolean
  );

  return (
    <div className="page campaign-detail">
      <Link className="back-link" to="/campaigns">
        ← All campaigns
      </Link>

      <section
        className="detail-hero"
        style={
          campaign.coverImage ? { backgroundImage: `url("${campaign.coverImage}")` } : undefined
        }
      >
        <div className="detail-hero-inner">
          <div className="badge-row">
            <CampaignBadge value={campaign.category} kind="category" />
            <CampaignBadge value={campaign.effectiveStatus || campaign.status} />
          </div>
          <h1>{title}</h1>
          <p className="detail-desc">{campaign.shortDescription}</p>
          <div className="detail-actions">
            {active && hasEscrow && (
              <button type="button" onClick={() => setDonateOpen(true)}>
                Donate now
              </button>
            )}
            {active && !hasEscrow && (
              <button type="button" className="secondary" onClick={() => setDonateOpen(true)}>
                Demo donate
              </button>
            )}
            {campaign.capabilities?.canEdit && (
              <Link className="ghost-link" to={`/dashboard/campaigns/${campaign.id}`}>
                Manage campaign
              </Link>
            )}
            <Link className="ghost-link" to={`/ledger?campaignId=${campaign.id}`}>
              Campaign ledger
            </Link>
          </div>
          {active && !hasEscrow && (
            <p className="muted detail-escrow-note">
              Escrow is not bound. Demo donations are recorded locally and are not verified
              on-chain.
            </p>
          )}
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <h2>Funding progress</h2>
          <CampaignProgress
            raised={campaign.raisedAmount}
            goal={campaign.goalAmount}
            percentage={campaign.progressPercentage}
            currency={campaign.currency}
          />
          <EscrowStatus campaign={campaign} />
          <div className="stat-grid">
            <div>
              <p className="stat-label">Donations</p>
              <strong>{campaign.donationCount || 0}</strong>
            </div>
            <div>
              <p className="stat-label">Deadline</p>
              <strong>
                <Deadline value={campaign.deadline} />
              </strong>
            </div>
            <div>
              <p className="stat-label">Goal</p>
              <strong>
                <Money value={campaign.goalAmount} currency={campaign.currency} />
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Who is involved</h2>
          <dl className="identity-list">
            <div>
              <dt>Organizer</dt>
              <dd>
                {campaign.organizer?.name ||
                  campaign.organizer?.displayName ||
                  "Campaign organizer"}
              </dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>
                {campaign.recipient?.name ||
                  campaign.recipient?.displayName ||
                  "Verified recipient"}
              </dd>
            </div>
            {campaign.organization && (
              <div>
                <dt>Organization</dt>
                <dd>
                  {campaign.organization.name}
                  {campaign.organization.status ? ` · ${campaign.organization.status}` : ""}
                </dd>
              </div>
            )}
          </dl>
          <ShareLinks title={title} />
        </section>
      </div>

      <section className="panel">
        <h2>About this campaign</h2>
        <div className="rich-copy">{campaign.description || "No description provided."}</div>
      </section>

      {media.length > 0 && (
        <section className="panel">
          <h2>Campaign media</h2>
          <div className="media-grid">
            {media.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={index === 0 ? `${title} cover` : `${title} media ${index + 1}`}
                loading="lazy"
              />
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Milestones</h2>
        <MilestoneTimeline milestones={campaign.milestones || []} proofs={proofs} />
      </section>

      <section className="panel">
        <h2>Submitted proofs</h2>
        {proofs.length === 0 ? (
          <p className="muted">No milestone proofs submitted yet.</p>
        ) : (
          <ul className="activity-list">
            {proofs.map((proof) => (
              <li key={proof.id}>
                <div>
                  <strong className="event-type">
                    Milestone {proof.milestoneIndex} · {proof.status}
                  </strong>
                  <p>{proof.note}</p>
                  {proof.evidenceUrls?.length > 0 && (
                    <p className="proof-note">
                      Evidence:{" "}
                      {proof.evidenceUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      ))}
                    </p>
                  )}
                </div>
                <time dateTime={proof.createdAt}>
                  {new Date(proof.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Campaign activity</h2>
        {events.length === 0 ? (
          <p className="muted">No ledger events yet for this campaign.</p>
        ) : (
          <ul className="activity-list">
            {events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong className="event-type">{event.type}</strong>
                  <p>{event.note}</p>
                  {event.txHash && (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenAddress(event.txHash, 4)}
                    </a>
                  )}
                </div>
                <time dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Campaign updates</h2>
        {updates.length === 0 ? (
          <EmptyState title="No updates yet">
            Published updates from the organizer will appear here.
          </EmptyState>
        ) : (
          <div className="updates-list">
            {updates
              .filter(
                (item) => item.publishedAt || item.status === "PUBLISHED" || item.publish
              )
              .map((item) => (
                <article key={item.id}>
                  <h3>{item.title}</h3>
                  <time dateTime={item.publishedAt || item.createdAt}>
                    {new Date(item.publishedAt || item.createdAt).toLocaleDateString()}
                  </time>
                  <p>{item.content}</p>
                </article>
              ))}
          </div>
        )}
      </section>

      {active && donateOpen && (
        <DonateModal
          campaign={campaign}
          onClose={() => setDonateOpen(false)}
          onSuccess={handleDonationSuccess}
        />
      )}
    </div>
  );
}
