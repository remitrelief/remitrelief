import { Link } from "react-router-dom";
import { Money } from "../CampaignUI";
import StatCard from "./StatCard";
import CampaignSummaryList from "./CampaignSummaryList";

const manageLink = (campaign) => `/dashboard/campaigns/${campaign.id}`;

export default function OrganizerSection({ organizer }) {
  const activeCount = organizer.byStatus?.ACTIVE || 0;
  return (
    <section className="panel dashboard-section" aria-labelledby="organizer-heading">
      <div className="section-title-row">
        <h2 id="organizer-heading">Your campaigns</h2>
        <Link className="secondary-link" to="/create-campaign">
          New campaign
        </Link>
      </div>
      <div className="stat-grid dashboard-stats">
        <StatCard label="Campaigns" value={organizer.campaignCount} hint={`${activeCount} active`} />
        <StatCard label="Raised on-chain" value={<Money value={organizer.totalRaised} />} />
        <StatCard label="Released" value={<Money value={organizer.totalReleased} />} />
        <StatCard
          label="Milestones verified"
          value={`${organizer.milestonesVerified} / ${organizer.milestonesTotal}`}
        />
      </div>

      {organizer.needsAttention.length > 0 && (
        <>
          <h3>Needs your attention</h3>
          <ul className="attention-list">
            {organizer.needsAttention.map((campaign) => (
              <li key={campaign.id}>
                <Link to={manageLink(campaign)}>{campaign.title}</Link>
                <span>{campaign.nextAction}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>All campaigns</h3>
      {organizer.campaigns.length === 0 ? (
        <p className="muted">
          You have not created a campaign yet. <Link to="/create-campaign">Start one</Link>.
        </p>
      ) : (
        <CampaignSummaryList campaigns={organizer.campaigns} linkTo={manageLink} />
      )}
    </section>
  );
}
