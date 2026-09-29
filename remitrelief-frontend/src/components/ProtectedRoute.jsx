import { Navigate, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";

/**
 * Route guard — requires RemitRelief authentication (not just wallet connect).
 * Optional `roles` array: user must have at least one.
 */
export default function ProtectedRoute({ children, roles }) {
  const { authenticated, loading, authenticating, roles: userRoles, login } = useAuth();
  const location = useLocation();

  if (loading || authenticating) {
    return (
      <section className="page">
        <p>Checking your session…</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="page narrow">
        <h1>Sign in required</h1>
        <p>Connect your Stellar wallet and approve a login signature to continue.</p>
        <button type="button" onClick={() => login().catch(() => {})}>
          Sign in with wallet
        </button>
        <p className="muted" style={{ marginTop: "1rem" }}>
          You will return to <code>{location.pathname}</code> after authentication.
        </p>
      </section>
    );
  }

  if (roles?.length) {
    const ok = roles.some((r) => userRoles.includes(r));
    if (!ok) {
      return (
        <section className="page narrow">
          <h1>Access denied</h1>
          <p>Your account does not have permission for this area.</p>
          <Navigate to="/" replace />
        </section>
      );
    }
  }

  return children;
}
