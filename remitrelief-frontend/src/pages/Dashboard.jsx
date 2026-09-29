import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchDonations, fetchMyDashboard } from "../lib/api";
import { ErrorState, LoadingState } from "../components/CampaignUI";
import ImpactStats from "../components/dashboard/ImpactStats";
import DonorSection from "../components/dashboard/DonorSection";
import OrganizerSection from "../components/dashboard/OrganizerSection";
import RecipientSection from "../components/dashboard/RecipientSection";
import DonationHistory from "../components/dashboard/DonationHistory";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, history] = await Promise.all([
        fetchMyDashboard(),
        fetchDonations().catch(() => []),
      ]);
      setSummary(dashboard);
      setDonations(Array.isArray(history) ? history : []);
    } catch (err) {
      setError(err.message || "Could not load your dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const campaignTitles = useMemo(
    () =>
      new Map(
        (summary?.donor?.supportedCampaigns || []).map((campaign) => [campaign.id, campaign.title])
      ),
    [summary]
  );

  const needsVerification =
    summary &&
    (summary.roles.includes("NGO") || summary.roles.includes("RECIPIENT")) &&
    summary.verificationStatus !== "VERIFIED";

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Your relief activity</h1>
          <p className="hero-copy">
            Giving, campaigns you run, and support you receive — in one place. Demo donations are
            labelled separately from verified on-chain deposits.
          </p>
        </div>
      </section>

      <ImpactStats />

      {loading && <LoadingState label="Loading your dashboard…" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && summary && (
        <>
          {needsVerification && (
            <p className="message warning" role="status">
              Your verification status is {summary.verificationStatus}. Proof submission and
              milestone verification stay locked until you are verified.{" "}
              <Link to="/verification">Review verification</Link>
            </p>
          )}
          {summary.organizer && <OrganizerSection organizer={summary.organizer} />}
          {summary.recipient && <RecipientSection recipient={summary.recipient} />}
          {summary.donor && <DonorSection donor={summary.donor} />}
          <DonationHistory donations={donations} campaignTitles={campaignTitles} />
        </>
      )}
    </div>
  );
}
