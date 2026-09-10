import { Link } from "react-router-dom";
import {
  CampaignBadge,
  CampaignProgress,
  Deadline,
  ManageLink,
  campaignTitle,
} from "./CampaignUI";

export default function CampaignCard({ campaign, onDonate }) {
  const title = campaignTitle(campaign);
  const active = (campaign.effectiveStatus || campaign.status) === "ACTIVE";

  return (
    <article className="campaign-card">
      <div className="campaign-visual">
        {campaign.coverImage && <img src={campaign.coverImage} alt="" loading="lazy" />}
        <CampaignBadge value={campaign.category} kind="category" />
      </div>
      <div className="campaign-body">
        <div className="campaign-header">
          <div>
            <p className="eyebrow">Campaign</p>
            <h3>
              <Link to={`/campaign/${campaign.slug || campaign.id}`}>{title}</Link>
            </h3>
          </div>
          <CampaignBadge value={campaign.effectiveStatus || campaign.status} />
        </div>
        <p className="campaign-summary">{campaign.shortDescription || campaign.description}</p>
        <CampaignProgress
          raised={campaign.raisedAmount}
          goal={campaign.goalAmount}
          percentage={campaign.progressPercentage}
          currency={campaign.currency}
        />
        <p className="campaign-meta"><Deadline value={campaign.deadline} /> · {campaign.donationCount || 0} donations</p>

        <div className="card-actions">
          <Link className="secondary-link" to={`/campaign/${campaign.slug || campaign.id}`}>
            View details
          </Link>
          <ManageLink campaign={campaign} />
          {active && onDonate && <button type="button" onClick={() => onDonate(campaign)}>
            Donate
          </button>}
        </div>
      </div>
    </article>
  );
}
