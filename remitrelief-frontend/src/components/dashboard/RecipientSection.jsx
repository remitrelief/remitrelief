import { Money } from "../CampaignUI";
import StatCard from "./StatCard";
import CampaignSummaryList from "./CampaignSummaryList";

const publicLink = (campaign) => `/campaigns/${campaign.slug || campaign.id}`;

export default function RecipientSection({ recipient }) {
  return (
    <section className="panel dashboard-section" aria-labelledby="recipient-heading">
      <h2 id="recipient-heading">Support you receive</h2>
      <div className="stat-grid dashboard-stats">
        <StatCard label="Campaigns for you" value={recipient.campaignCount} />
        <StatCard label="Released to you" value={<Money value={recipient.totalReleased} />} />
      </div>
      {recipient.campaigns.length === 0 ? (
        <p className="muted">No campaigns name you as recipient yet.</p>
      ) : (
        <CampaignSummaryList campaigns={recipient.campaigns} linkTo={publicLink} />
      )}
    </section>
  );
}
