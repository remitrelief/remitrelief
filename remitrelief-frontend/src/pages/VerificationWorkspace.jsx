import { useCallback, useEffect, useState } from "react";
import { fetchMyVerification, submitVerificationRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { ErrorState, LoadingState } from "../components/CampaignUI";

const REQUESTABLE_ROLES = ["NGO", "RECIPIENT"];
const STATEMENT_MIN = 20;
const STATEMENT_MAX = 2000;

function RequestBlockedNotice({ status, availableRoles }) {
  if (status === "SUSPENDED") {
    return (
      <p className="message error" role="status">
        Your account is suspended. Contact an administrator to be reinstated.
      </p>
    );
  }
  if (status === "PENDING") {
    return <p className="muted">A request is pending admin review.</p>;
  }
  if (!availableRoles.length) {
    return <p className="muted">You are verified for every requestable role.</p>;
  }
  return null;
}

export default function VerificationWorkspace() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ requestedRole: "", statement: "", evidenceUrl: "" });

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

  const status = state?.verificationStatus || "UNVERIFIED";
  const roles = state?.roles || [];
  const hasPendingRequest = (state?.requests || []).some((item) => item.status === "PENDING");
  const availableRoles = REQUESTABLE_ROLES.filter(
    (role) => !(status === "VERIFIED" && roles.includes(role))
  );
  const canRequest =
    status !== "SUSPENDED" && status !== "PENDING" && !hasPendingRequest && availableRoles.length > 0;
  const requestedRole = availableRoles.includes(draft.requestedRole)
    ? draft.requestedRole
    : availableRoles[0];

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await submitVerificationRequest({
        requestedRole,
        statement: draft.statement.trim(),
        evidenceUrls: draft.evidenceUrl.trim() ? [draft.evidenceUrl.trim()] : [],
      });
      toast.push("Verification request submitted", "success");
      setDraft({ requestedRole: "", statement: "", evidenceUrl: "" });
      await load();
    } catch (err) {
      setError(err.message);
      toast.push(err.message || "Could not submit verification", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading verification status…" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page">
        <ErrorState message={error || "Could not load verification status."} onRetry={load} />
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
          Verification: <strong>{status}</strong>
        </p>
        <p className="muted">Roles: {roles.join(", ") || "DONOR"}</p>
      </section>

      <section className="panel">
        <h2>Request verification</h2>
        {canRequest ? (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="input-label">
              Requested role
              <select
                value={requestedRole}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, requestedRole: event.target.value }))
                }
              >
                {availableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label className="input-label full">
              Statement
              <textarea
                required
                minLength={STATEMENT_MIN}
                maxLength={STATEMENT_MAX}
                rows={5}
                value={draft.statement}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, statement: event.target.value }))
                }
                placeholder={`Describe your organization or recipient role (min ${STATEMENT_MIN} characters)`}
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
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </form>
        ) : (
          <RequestBlockedNotice
            status={hasPendingRequest ? "PENDING" : status}
            availableRoles={availableRoles}
          />
        )}
      </section>

      <section className="panel">
        <h2>Request history</h2>
        {!state.requests?.length ? (
          <p className="muted">No verification requests yet.</p>
        ) : (
          <ul className="admin-queue">
            {state.requests.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.requestedRole}</strong>
                  <span className="muted"> · {item.status}</span>
                  <p className="muted">{item.statement}</p>
                  {item.reviewNote && <p className="muted">Reviewer note: {item.reviewNote}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
