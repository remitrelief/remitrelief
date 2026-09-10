import { NavLink, Outlet } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function authStatusLabel({ isConnected, authenticated, authenticating, authFailed }) {
  if (authenticating) return "Signing in…";
  if (authFailed) return "Sign-in failed";
  if (authenticated) return "Signed in";
  if (isConnected) return "Connected — not signed in";
  return "Disconnected";
}

export default function Layout() {
  const { address, shortAddress, connecting, connect, disconnect, isConnected } = useWallet();
  const {
    authenticated,
    authenticating,
    authFailed,
    login,
    logout,
    roles,
    error: authError,
  } = useAuth();
  const toast = useToast();

  async function handleConnect() {
    try {
      await connect();
      toast.push("Wallet connected — approve the sign-in message", "success");
      await login();
      toast.push("Signed in to RemitRelief", "success");
    } catch (err) {
      if (!String(err.message || "").includes("cancelled")) {
        toast.push(err.message || "Connection failed", "error");
      }
    }
  }

  async function handleLogin() {
    try {
      await login();
      toast.push("Signed in to RemitRelief", "success");
    } catch (err) {
      toast.push(err.message || "Sign-in failed", "error");
    }
  }

  async function handleLogout() {
    await logout();
    toast.push("Signed out of RemitRelief", "success");
  }

  function handleDisconnect() {
    logout();
    disconnect();
  }

  const status = authStatusLabel({
    isConnected,
    authenticated,
    authenticating,
    authFailed,
  });

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink to="/campaigns" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">RemitRelief</span>
        </NavLink>
        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/campaigns">
            Campaigns
          </NavLink>
          <NavLink to="/create-campaign">Create</NavLink>
          <NavLink to="/dashboard/campaigns">My campaigns</NavLink>
          <NavLink to="/ledger">Ledger</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/verify">Verify</NavLink>
        </nav>
        <div className="header-wallet">
          <span className="wallet-chip status-chip" title={authError || status}>
            {status}
          </span>
          {isConnected ? (
            <>
              <span className="wallet-chip" title={address}>
                {shortAddress}
                {authenticated && roles?.[0] ? ` · ${roles[0]}` : ""}
              </span>
              {!authenticated && (
                <button
                  type="button"
                  className="compact"
                  onClick={handleLogin}
                  disabled={authenticating}
                >
                  {authenticating ? "Signing in…" : "Sign in"}
                </button>
              )}
              {authenticated && (
                <button type="button" className="secondary compact" onClick={handleLogout}>
                  Sign out
                </button>
              )}
              <button type="button" className="secondary compact" onClick={handleDisconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button type="button" className="compact" onClick={handleConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Milestone-escrowed disaster relief on Stellar testnet.</p>
      </footer>
    </div>
  );
}
