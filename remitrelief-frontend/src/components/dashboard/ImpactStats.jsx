import { useEffect, useState } from "react";
import { fetchStats } from "../../lib/api";
import { Money } from "../CampaignUI";
import StatCard from "./StatCard";

/**
 * Public, platform-wide impact strip. Renders nothing if stats are unavailable.
 */
export default function ImpactStats({ title = "Platform impact" }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return null;

  const milestonesTotal = Number(stats.milestonesTotal) || 0;
  return (
    <section className="impact-stats" aria-label={title}>
      <h2 className="sr-only">{title}</h2>
      <div className="stat-grid dashboard-stats">
        <StatCard
          label="Raised on-chain"
          value={<Money value={stats.totalRaised} />}
          hint="Verified Stellar testnet deposits only"
        />
        <StatCard label="Released to recipients" value={<Money value={stats.amountReleased} />} />
        <StatCard label="Active campaigns" value={Number(stats.campaignsActive) || 0} />
        {milestonesTotal > 0 && (
          <StatCard
            label="Milestones verified"
            value={`${Number(stats.milestonesVerified) || 0} / ${milestonesTotal}`}
          />
        )}
      </div>
    </section>
  );
}
