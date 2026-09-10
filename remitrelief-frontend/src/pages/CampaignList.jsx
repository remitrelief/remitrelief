import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CampaignCard from "../components/CampaignCard";
import DonateModal from "../components/DonateModal";
import {
  CampaignFilters,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
} from "../components/CampaignUI";
import { fetchCampaigns } from "../lib/api";

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    sort: searchParams.get("sort") || "newest",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCampaigns({ ...filters, limit: 12 });
      setCampaigns(result.data || []);
      setMeta(result.meta || { page: 1, totalPages: 1, total: result.data?.length || 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters.search, filters.category, filters.sort, filters.page]);

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== "page") next.delete("page");
    setSearchParams(next);
  }

  function handleDonationSuccess() {
    load();
  }

  return (
    <div className="page campaign-list">
      <section className="hero-card">
        <div className="hero-copy-block">
          <p className="eyebrow">Transparent community relief</p>
          <h1>Support campaigns built around measurable outcomes.</h1>
          <p className="hero-copy">
            Discover verified relief work, follow milestones, and see each campaign’s progress.
          </p>
          <div className="hero-actions">
            <a href="#campaigns">Explore campaigns</a>
            <Link to="/create-campaign">Start a campaign</Link>
          </div>
        </div>
        <div className="hero-stat-card"><span className="stat-label">Campaigns found</span><strong>{meta.total || 0}</strong></div>
      </section>

      <section id="campaigns" className="section-block">
        <div className="section-heading row-between">
          <div><h2>Explore campaigns</h2><p>Search and filter active public campaigns.</p></div>
          <Link className="secondary-link" to="/create-campaign">
            + Create campaign
          </Link>
        </div>
        <CampaignFilters values={filters} onChange={updateFilter} />
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && campaigns.length === 0 && <EmptyState title="No campaigns found">Try changing your search or category.</EmptyState>}
        {!loading && !error && campaigns.length > 0 && (
          <div className="grid">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} onDonate={setSelected} />
            ))}
          </div>
        )}
        <Pagination page={meta.page || filters.page} totalPages={meta.totalPages || 1} onPageChange={(page) => updateFilter("page", String(page))} />
      </section>

      {selected && (
        <DonateModal
          campaign={selected}
          onClose={() => setSelected(null)}
          onSuccess={handleDonationSuccess}
        />
      )}
    </div>
  );
}
