import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CampaignCard from "../components/CampaignCard";
import { EmptyState, ErrorState, LoadingState, Pagination } from "../components/CampaignUI";
import { fetchMyCampaigns } from "../lib/api";

export default function MyCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchMyCampaigns({ page, limit: 12 });
      setCampaigns(result.data || []);
      setMeta(result.meta || { page, totalPages: 1 });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <section className="page-header">
        <div><p className="eyebrow">Organizer workspace</p><h1>My campaigns</h1><p className="hero-copy">Manage drafts, submissions, and active campaigns.</p></div>
        <Link className="secondary-link" to="/create-campaign">Create campaign</Link>
      </section>
      {loading && <LoadingState label="Loading your campaigns…" />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && campaigns.length === 0 && <EmptyState title="No campaigns yet">Create your first campaign to get started.</EmptyState>}
      {!loading && !error && campaigns.length > 0 && <div className="grid">{campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</div>}
      <Pagination page={meta.page || page} totalPages={meta.totalPages || 1} onPageChange={setPage} />
    </div>
  );
}
