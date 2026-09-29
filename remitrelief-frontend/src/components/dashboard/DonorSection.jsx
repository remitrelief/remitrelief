import { Link } from "react-router";
import { Money } from "../CampaignUI";
import StatCard from "./StatCard";
import CampaignSummaryList from "./CampaignSummaryList";

const publicLink = (campaign) => `/campaigns/${campaign.slug || campaign.id}`;

export default function DonorSection({ donor }) {
  const demoGiven = Math.max(0, donor.totalGiven - donor.totalGivenOnChain);
  return (
    <section className="panel dashboard-section" aria-labelledby="donor-heading">
      <h2 id="donor-heading">Your giving</h2>
      <div className="stat-grid dashboard-stats">
        <StatCard
          label="Total given"
          value={<Money value={donor.totalGiven} />}
          hint={demoGiven > 0 ? `Includes ${demoGiven} USDC in demo donations` : undefined}
        />
        <StatCard label="Donations" value={donor.donationCount} />
        <StatCard label="Campaigns supported" value={donor.campaignsSupported} />
        <StatCard
          label="Released on campaigns you back"
          value={<Money value={donor.releasedOnSupported} />}
        />
      </div>

      <h3>Campaigns you support</h3>
      {donor.supportedCampaigns.length === 0 ? (
        <p className="muted">
          No donations yet. <Link to="/campaigns">Browse campaigns</Link> to make your first gift.
        </p>
      ) : (
        <CampaignSummaryList
          campaigns={donor.supportedCampaigns}
          linkTo={publicLink}
          renderMeta={(campaign) => (
            <>
              {" · You gave "}
              <Money value={campaign.givenAmount} currency={campaign.currency} />
            </>
          )}
        />
      )}
    </section>
  );
}
