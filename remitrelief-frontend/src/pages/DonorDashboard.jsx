import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDonations, fetchCampaigns, fetchStats } from "../lib/api";
import { shortenAddress } from "../lib/stellar";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";

export default function DonorDashboard() {
  const { walletAddress, authenticated, login } = useAuth();
  const { shortAddress, connect, disconnect, isConnected, connecting } = useWallet();
  const address = walletAddress;
  const toast = useToast();
  const [donations, setDonations] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchCampaigns(), fetchStats()])
      .then(([list, s]) => {
        setCampaigns(list.data || []);
        setStats(s);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!address) {
      setDonations([]);
      return;
    }
    setLoading(true);
    fetchDonations({ donor: address })
      .then(setDonations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [address]);

  async function handleConnect() {
    try {
      await connect();
      toast.push("Wallet connected", "success");
    } catch (err) {
      setError(err.message || "Could not connect wallet");
    }
  }

  const campaignName = (id) => {
    const campaign = campaigns.find((item) => item.id === id);
    return campaign?.title || campaign?.name || id;
  };
  const totalGiven = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Donor dashboard</p>
          <h1>Your relief contributions</h1>
          <p className="hero-copy">
            Connect your Stellar wallet to see donations recorded against your public key.
          </p>
        </div>
        <div className="page-header-actions">
          {isConnected ? (
            <>
              <span className="wallet-chip" title={address}>
                {shortAddress}
              </span>
              <button type="button" className="secondary" onClick={disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button type="button" onClick={handleConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </section>

      {error && <div className="message error">{error}</div>}

      {stats && (
        <div className="stat-grid dashboard-stats platform-strip">
          <div className="panel compact">
            <p className="stat-label">Platform raised</p>
            <strong>${Number(stats.totalRaised).toLocaleString()}</strong>
          </div>
          <div className="panel compact">
            <p className="stat-label">Released to recipients</p>
            <strong>${Number(stats.amountReleased).toLocaleString()}</strong>
          </div>
          <div className="panel compact">
            <p className="stat-label">Active campaigns</p>
            <strong>{stats.campaignsActive}</strong>
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="panel empty-panel">
          <p>Connect Freighter or Albedo to load your donation history.</p>
        </div>
      )}

      {isConnected && (
        <>
          <div className="stat-grid dashboard-stats">
            <div className="panel compact">
              <p className="stat-label">Total given</p>
              <strong>${totalGiven.toLocaleString()}</strong>
            </div>
            <div className="panel compact">
              <p className="stat-label">Donations</p>
              <strong>{donations.length}</strong>
            </div>
            <div className="panel compact">
              <p className="stat-label">Campaigns supported</p>
              <strong>{new Set(donations.map((d) => d.campaignId)).size}</strong>
            </div>
          </div>

          <section className="panel">
            <h2>Donation history</h2>
            {loading && <p className="muted">Loading…</p>}
            {!loading && donations.length === 0 && (
              <p className="muted">
                No donations yet. <Link to="/">Browse campaigns</Link> to make your first gift.
              </p>
            )}
            {!loading && donations.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Amount</th>
                      <th>Note</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Link to={`/campaigns/${d.campaignId}`}>{campaignName(d.campaignId)}</Link>
                        </td>
                        <td>${Number(d.amount).toLocaleString()}</td>
                        <td>{d.message || "—"}</td>
                        <td>
                          <span className="status-pill status-verified">{d.status}</span>
                        </td>
                        <td>{new Date(d.createdAt).toLocaleString()}</td>
                        <td>
                          {d.txHash ? (
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${d.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {shortenAddress(d.txHash, 4)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
