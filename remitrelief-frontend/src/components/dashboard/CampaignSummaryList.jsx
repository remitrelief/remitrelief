import { Link } from "react-router-dom";
import { CampaignBadge, CampaignProgress, Money } from "../CampaignUI";

/**
 * Compact campaign rows for dashboards. `renderMeta(campaign)` adds role-specific details;
 * `linkTo(campaign)` picks public vs management link.
 */
export default function CampaignSummaryList({ campaigns, linkTo, renderMeta }) {
  return (
    <ul className="summary-list">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="summary-item">
          <div className="summary-heading">
            <Link to={linkTo(campaign)}>{campaign.title}</Link>
            <CampaignBadge value={campaign.status} />
          </div>
          <CampaignProgress
            raised={campaign.raisedAmount}
            goal={campaign.goalAmount}
            percentage={campaign.progressPercentage}
            currency={campaign.currency}
          />
          <p className="summary-meta">
            Milestones verified {campaign.milestonesVerified} / {campaign.milestonesTotal}
            {campaign.releasedAmount > 0 && (
              <>
                {" · Released "}
                <Money value={campaign.releasedAmount} currency={campaign.currency} />
              </>
            )}
            {renderMeta?.(campaign)}
          </p>
        </li>
      ))}
    </ul>
  );
}
