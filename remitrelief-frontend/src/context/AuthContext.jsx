import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "./WalletContext";
import {
  clearSessionToken,
  fetchAuthChallenge,
  fetchMe,
  logoutAuth,
  setSessionToken,
  setUnauthorizedHandler,
  verifyAuthChallenge,
} from "../lib/api";

const AuthContext = createContext(null);

/**
 * RemitRelief authentication (session) — separate from wallet connection.
 */
export function AuthProvider({ children }) {
  const wallet = useWallet();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [authFailed, setAuthFailed] = useState(false);

  const clearAuth = useCallback(() => {
    setUser(null);
    clearSessionToken();
    setAuthFailed(false);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const me = await fetchMe();
      const nextUser = me.user || me;
      setUser(nextUser);
      setError(null);
      return nextUser;
    } catch {
      clearAuth();
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearAuth]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setError("Your session expired. Please sign in again.");
    });
    refreshSession();
  }, [refreshSession]);

  async function login() {
    setAuthenticating(true);
    setError(null);
    setAuthFailed(false);
    try {
      const publicKey = await wallet.ensureConnected();
      const challenge = await fetchAuthChallenge(publicKey);
      const signature = await wallet.signAuthMessage(challenge.message);
      const result = await verifyAuthChallenge({
        publicKey,
        nonce: challenge.nonce,
        signature,
        signedMessage: challenge.message,
      });
      if (result.sessionId) setSessionToken(result.sessionId);
      setUser(result.user);
      return result.user;
    } catch (err) {
      setAuthFailed(true);
      setError(err.message || "Authentication failed");
      throw err;
    } finally {
      setAuthenticating(false);
    }
  }

  async function logout() {
    try {
      await logoutAuth();
    } catch {
      /* ignore network errors on logout */
    }
    clearAuth();
  }

  async function ensureAuthenticated() {
    if (user?.walletAddress || user?.publicKey) {
      return user.walletAddress || user.publicKey;
    }
    const me = await refreshSession();
    if (me) return me.walletAddress || me.publicKey;
    const loggedIn = await login();
    return loggedIn.walletAddress || loggedIn.publicKey;
  }

  const walletAddress = user?.walletAddress || user?.publicKey || "";
  const authenticated = Boolean(user && walletAddress);

  return (
    <AuthContext.Provider
      value={{
        user,
        walletAddress,
        role: user?.roles?.[0] || null,
        roles: user?.roles || [],
        authenticated,
        loading,
        authenticating,
        authFailed,
        error,
        login,
        logout,
        refreshSession,
        ensureAuthenticated,
        /** Convenience: wallet connected but not authenticated */
        needsAuth: wallet.isConnected && !authenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
