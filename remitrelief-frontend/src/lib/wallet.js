import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { FreighterModule, FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule, ALBEDO_ID } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { NETWORK_PASSPHRASE } from "./stellar.js";

// Per-module imports keep hardware/WalletConnect wallets out of the bundle.
const SUPPORTED_WALLET_IDS = new Set([FREIGHTER_ID, ALBEDO_ID]);
const WALLET_ID_STORAGE_KEY = "remitrelief_wallet_id";

function readStoredWalletId() {
  const id = localStorage.getItem(WALLET_ID_STORAGE_KEY);
  return id && SUPPORTED_WALLET_IDS.has(id) ? id : undefined;
}

StellarWalletsKit.init({
  modules: [new FreighterModule(), new AlbedoModule()],
  network: NETWORK_PASSPHRASE,
  // The kit does not restore the chosen wallet across reloads; signing needs it.
  selectedWalletId: readStoredWalletId(),
});

/** The kit rejects with plain `{ code, message }` objects; normalize to Error. */
function toError(err, fallback) {
  if (err instanceof Error) return err;
  const error = new Error(err?.message || fallback);
  if (err?.code != null) error.code = err.code;
  return error;
}

async function callKit(action, fallbackMessage) {
  try {
    return await action();
  } catch (err) {
    throw toError(err, fallbackMessage);
  }
}

export function isWalletSelected() {
  try {
    return Boolean(StellarWalletsKit.selectedModule);
  } catch {
    return false;
  }
}

export async function connectWallet() {
  const { address } = await callKit(
    () => StellarWalletsKit.authModal(),
    "Wallet connection cancelled"
  );
  localStorage.setItem(WALLET_ID_STORAGE_KEY, StellarWalletsKit.selectedModule.productId);
  return address;
}

export async function disconnectWallet() {
  localStorage.removeItem(WALLET_ID_STORAGE_KEY);
  await callKit(() => StellarWalletsKit.disconnect(), "Could not disconnect wallet").catch(() => {});
}

export async function signTransaction(xdr, publicKey) {
  if (!isWalletSelected()) {
    throw new Error("Wallet session expired. Reconnect your wallet and try again.");
  }
  const { signedTxXdr } = await callKit(
    () =>
      StellarWalletsKit.signTransaction(xdr, {
        address: publicKey,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    "Wallet did not sign the transaction"
  );
  return signedTxXdr;
}

/**
 * Sign an auth challenge message. Returns base64 signature string.
 */
export async function signMessage(message, publicKey) {
  const { signedMessage } = await callKit(
    () =>
      StellarWalletsKit.signMessage(message, {
        address: publicKey,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    "Wallet did not sign the message"
  );
  if (!signedMessage) {
    throw new Error("Wallet did not return a message signature");
  }
  return signedMessage;
}
