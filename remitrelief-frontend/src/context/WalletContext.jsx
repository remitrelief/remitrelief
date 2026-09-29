import { createContext, useContext, useEffect, useState } from "react";
import { shortenAddress } from "../lib/address";

const STORAGE_KEY = "remitrelief_donor";
const WalletContext = createContext(null);

// The wallet kit + Stellar SDK are ~1 MB; load them only when a wallet action happens.
const loadWalletModule = () => import("../lib/wallet");

/**
 * Wallet connection only — does NOT mean RemitRelief authenticated.
 * Use AuthContext for session/login state.
 */
export function WalletProvider({ children }) {
  const [address, setAddress] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (address) localStorage.setItem(STORAGE_KEY, address);
    else localStorage.removeItem(STORAGE_KEY);
  }, [address]);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const { connectWallet } = await loadWalletModule();
      const pk = await connectWallet();
      setAddress(pk);
      return pk;
    } catch (err) {
      setError(err.message || "Could not connect wallet");
      throw err;
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    setAddress("");
    setError(null);
    loadWalletModule()
      .then(({ disconnectWallet }) => disconnectWallet())
      .catch(() => {});
  }

  async function ensureConnected() {
    if (address) return address;
    return connect();
  }

  async function signAuthMessage(message) {
    const wallet = await loadWalletModule();
    // A stored address without a selected wallet (e.g. after reload) cannot sign; reconnect.
    const pk = address && wallet.isWalletSelected() ? address : await connect();
    return wallet.signMessage(message, pk);
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        shortAddress: address ? shortenAddress(address, 4) : "",
        connecting,
        error,
        connect,
        disconnect,
        ensureConnected,
        signAuthMessage,
        isConnected: Boolean(address),
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
