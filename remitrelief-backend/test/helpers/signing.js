/**
 * Sign an auth challenge message the way a wallet would (base64 ed25519 signature).
 * Keypair#sign returns a plain Uint8Array in stellar-sdk >= 13, so wrap it before encoding.
 */
export function signChallengeMessage(keypair, message) {
  return Buffer.from(keypair.sign(Buffer.from(message, "utf8"))).toString("base64");
}
