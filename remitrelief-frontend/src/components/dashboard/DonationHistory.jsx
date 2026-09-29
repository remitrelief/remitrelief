import { Link } from "react-router-dom";
import { Money } from "../CampaignUI";
import { shortenAddress } from "../../lib/address";

export default function DonationHistory({ donations, campaignTitles }) {
  if (!donations.length) return null;
  return (
    <section className="panel" aria-labelledby="history-heading">
      <h2 id="history-heading">Donation history</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Campaign</th>
              <th scope="col">Amount</th>
              <th scope="col">Note</th>
              <th scope="col">Trust</th>
              <th scope="col">Date</th>
              <th scope="col">Tx</th>
            </tr>
          </thead>
          <tbody>
            {donations.map((donation) => (
              <tr key={donation.id}>
                <td>
                  <Link to={`/campaigns/${donation.campaignId}`}>
                    {campaignTitles.get(donation.campaignId) || donation.campaignId}
                  </Link>
                </td>
                <td>
                  <Money value={donation.amount} />
                </td>
                <td>{donation.message || "—"}</td>
                <td>
                  <span
                    className={`status-pill ${donation.verifiedOnChain ? "status-verified" : "status-demo"}`}
                  >
                    {donation.verifiedOnChain ? "On-chain" : "Demo"}
                  </span>
                </td>
                <td>{new Date(donation.createdAt).toLocaleString()}</td>
                <td>
                  {donation.txHash ? (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${donation.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenAddress(donation.txHash, 4)}
                      <span className="sr-only"> (opens Stellar Expert in a new tab)</span>
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
    </section>
  );
}
