import { useCallback, useEffect, useState } from "react";
import { fetchMyVerification, submitVerificationRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { ErrorState, LoadingState } from "../components/CampaignUI";

export default function VerificationWorkspace() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    requestedRole: "NGO",
    statement: "",
    evidenceUrl: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await fetchMyVerification());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await submitVerificationRequest({
        requestedRole: draft.requestedRole,
        statement: draft.statement,
        evidenceUrls: draft.evidenceUrl.trim() ? [draft.evidenceUrl.trim()] : [],
      });
      toast.push("Verification request submitted", "success");
      setDraft((current) => ({ ...current, statement: "", evidenceUrl: "" }));
      await load();
    } catch (err) {
      setError(err.message);
      toast.push(err.message || "Could not submit verification", "error");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading verification status…" />
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Identity</p>
          <h1>Verification</h1>
          <p className="hero-copy">
            Request NGO or recipient status gating so you can submit proofs and verify
            milestones. This is application status only — not full KYC or identity
            attestation.
          </p>
        </div>
      </section>

      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2>Current status</h2>
        <p>
          Verification: <strong>{state?.verificationStatus || "UNVERIFIED"}</strong>
        </p>
        <p className="muted">
          Roles: {(state?.roles || []).join(", ") || "DONOR"}
        </p>
      </section>

      <section className="panel">
        <h2>Request verification</h2>
        {state?.verificationStatus === "VERIFIED" ? (
          <p className="muted">You are already verified.</p>
        ) : state?.verificationStatus === "PENDING" ? (
          <p className="muted">A request is pending admin review.</p>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="input-label">
              Requested role
              <select
                value={draft.requestedRole}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, requestedRole: event.target.value }))
                }
              >
                <option value="NGO">NGO</option>
                <option value="RECIPIENT">RECIPIENT</option>
              </select>
            </label>
            <label className="input-label full">
              Statement
              <textarea
                required
                minLength={20}
                rows={5}
                value={draft.statement}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, statement: event.target.value }))
                }
                placeholder="Describe your organization or recipient role (min 20 characters)"
              />
            </label>
            <label className="input-label full">
              Optional evidence URL
              <input
                type="url"
                value={draft.evidenceUrl}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, evidenceUrl: event.target.value }))
                }
                placeholder="https://…"
              />
            </label>
            <button type="submit">Submit for review</button>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Request history</h2>
        {!state?.requests?.length ? (
          <ErrorState message="No verification requests yet." />
        ) : (
          <ul className="admin-queue">
            {state.requests.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.requestedRole}</strong>
                  <span className="muted"> · {item.status}</span>
                  <p className="muted">{item.statement}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
