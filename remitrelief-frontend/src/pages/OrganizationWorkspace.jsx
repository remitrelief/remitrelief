import { useCallback, useEffect, useState } from "react";
import {
  createOrganization,
  fetchMyOrganizations,
} from "../lib/api";
import { useToast } from "../context/ToastContext";
import { ErrorState, LoadingState } from "../components/CampaignUI";

export default function OrganizationWorkspace() {
  const toast = useToast();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOrganizations(await fetchMyOrganizations());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    try {
      await createOrganization(draft);
      toast.push("Organization submitted for verification", "success");
      setDraft({ name: "", description: "" });
      await load();
    } catch (err) {
      setError(err.message);
      toast.push(err.message || "Could not create organization", "error");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading organizations…" />
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Organizations</p>
          <h1>NGO workspace</h1>
          <p className="hero-copy">
            Create an organization and wait for an admin to mark it verified. This is status
            gating only — not identity KYC.
          </p>
        </div>
      </section>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2>Create organization</h2>
        <form className="form-grid" onSubmit={handleCreate}>
          <label className="input-label">
            Name
            <input
              required
              minLength={3}
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="input-label full">
            Description
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <button type="submit">Submit for verification</button>
        </form>
      </section>

      <section className="panel">
        <h2>Your organizations</h2>
        {organizations.length === 0 ? (
          <ErrorState message="No organizations yet." />
        ) : (
          <ul className="admin-queue">
            {organizations.map((org) => (
              <li key={org.id}>
                <div>
                  <strong>{org.name}</strong>
                  <span className="muted"> · {org.status}</span>
                  {org.membershipRole && (
                    <span className="muted"> · {org.membershipRole}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
