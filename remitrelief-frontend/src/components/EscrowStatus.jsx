const EXPLORER_CONTRACT =
  "https://stellar.expert/explorer/testnet/contract";

export function truncateContractId(address, head = 6, tail = 6) {
  if (!address) return "";
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export default function EscrowStatus({ campaign }) {
  const address = campaign?.escrowAddress;
  if (!address) {
    return (
      <p className="muted escrow-status" role="status">
        Escrow not bound — on-chain donations unavailable until an admin binds a testnet
        escrow address.
      </p>
    );
  }

  return (
    <p className="escrow-status" role="status">
      Escrow bound:{" "}
      <a
        href={`${EXPLORER_CONTRACT}/${address}`}
        target="_blank"
        rel="noreferrer"
        title={address}
      >
        {truncateContractId(address)}
      </a>
    </p>
  );
}
