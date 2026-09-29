import {
  Horizon,
  TransactionBuilder,
  Networks,
  rpc,
} from "@stellar/stellar-sdk";

const NETWORK = (import.meta.env.VITE_STELLAR_NETWORK || "TESTNET").toUpperCase();

function resolvePassphrase(network) {
  if (network === "TESTNET") return Networks.TESTNET;
  if (network === "PUBLIC" || network === "MAINNET") {
    throw new Error("Mainnet is disabled in this build");
  }
  if (network === "FUTURENET") return "Test SDF Future Network ; October 2022";
  // Default safely to testnet
  return Networks.TESTNET;
}

const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = resolvePassphrase(NETWORK);

export const horizon = new Horizon.Server(HORIZON_URL);
export const sorobanServer = new rpc.Server(SOROBAN_RPC_URL, { allowHttp: false });

/**
 * Submit a wallet-signed Soroban transaction and wait for confirmation.
 */
export async function submitSignedSorobanTx(signedXDR) {
  const tx = TransactionBuilder.fromXDR(signedXDR, NETWORK_PASSPHRASE);
  const sendResult = await sorobanServer.sendTransaction(tx);
  if (sendResult.status === "ERROR") {
    throw new Error(`Submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }
  return pollTransaction(sendResult.hash);
}

async function pollTransaction(hash, { intervalMs = 1500, timeoutMs = 45000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await sorobanServer.getTransaction(hash);
    if (res.status === "SUCCESS") return { hash, status: res.status };
    if (res.status === "FAILED") {
      throw new Error(`Transaction failed on network`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Transaction ${hash} did not settle in time`);
}