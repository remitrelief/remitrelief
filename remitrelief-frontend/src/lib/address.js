/** Shorten a Stellar public key for display. */
export function shortenAddress(address, chars = 4) {
  if (!address) return "";
  if (address.length < 12) return address;
  return `${address.slice(0, chars + 1)}…${address.slice(-chars)}`;
}
