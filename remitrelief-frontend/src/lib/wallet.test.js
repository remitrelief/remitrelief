import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => ({
  init: vi.fn(),
  authModal: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  selected: null,
}));

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: {
    init: kit.init,
    authModal: kit.authModal,
    disconnect: kit.disconnect,
    signTransaction: kit.signTransaction,
    signMessage: kit.signMessage,
    get selectedModule() {
      if (!kit.selected) throw { code: -3, message: "Please set the wallet first" };
      return kit.selected;
    },
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FREIGHTER_ID: "freighter",
  FreighterModule: class {
    productId = "freighter";
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/albedo", () => ({
  ALBEDO_ID: "albedo",
  AlbedoModule: class {
    productId = "albedo";
  },
}));
vi.mock("./stellar.js", () => ({ NETWORK_PASSPHRASE: "Test SDF Network ; September 2015" }));

const PASSPHRASE = "Test SDF Network ; September 2015";
const ADDRESS = "GDONORADDRESS";

async function loadWallet() {
  vi.resetModules();
  return import("./wallet.js");
}

describe("wallet (stellar-wallets-kit v2 adapter)", () => {
  beforeEach(() => {
    localStorage.clear();
    kit.selected = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initialises on testnet and restores only a supported stored wallet", async () => {
    localStorage.setItem("remitrelief_wallet_id", "freighter");
    await loadWallet();
    expect(kit.init).toHaveBeenLastCalledWith(
      expect.objectContaining({ network: PASSPHRASE, selectedWalletId: "freighter" })
    );

    localStorage.setItem("remitrelief_wallet_id", "some-unknown-wallet");
    await loadWallet();
    expect(kit.init).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedWalletId: undefined })
    );
  });

  it("connects through the auth modal and remembers the chosen wallet", async () => {
    const wallet = await loadWallet();
    kit.authModal.mockImplementation(async () => {
      kit.selected = { productId: "albedo" };
      return { address: ADDRESS };
    });

    await expect(wallet.connectWallet()).resolves.toBe(ADDRESS);
    expect(localStorage.getItem("remitrelief_wallet_id")).toBe("albedo");
    expect(wallet.isWalletSelected()).toBe(true);
  });

  it("normalises kit rejections into Error instances", async () => {
    const wallet = await loadWallet();
    kit.authModal.mockRejectedValue({ code: -1, message: "The user closed the modal." });

    const error = await wallet.connectWallet().catch((err) => err);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("The user closed the modal.");
    expect(error.code).toBe(-1);
  });

  it("refuses to sign a transaction when no wallet is selected", async () => {
    const wallet = await loadWallet();
    await expect(wallet.signTransaction("AAAA", ADDRESS)).rejects.toThrow(/reconnect your wallet/i);
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });

  it("signs transactions and messages on the configured network", async () => {
    const wallet = await loadWallet();
    kit.selected = { productId: "freighter" };
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "SIGNED_XDR" });
    kit.signMessage.mockResolvedValue({ signedMessage: "c2lnbmF0dXJl" });

    await expect(wallet.signTransaction("AAAA", ADDRESS)).resolves.toBe("SIGNED_XDR");
    expect(kit.signTransaction).toHaveBeenCalledWith("AAAA", {
      address: ADDRESS,
      networkPassphrase: PASSPHRASE,
    });

    await expect(wallet.signMessage("login challenge", ADDRESS)).resolves.toBe("c2lnbmF0dXJl");
    expect(kit.signMessage).toHaveBeenCalledWith("login challenge", {
      address: ADDRESS,
      networkPassphrase: PASSPHRASE,
    });
  });

  it("rejects an empty message signature and clears the stored wallet on disconnect", async () => {
    const wallet = await loadWallet();
    kit.signMessage.mockResolvedValue({ signedMessage: "" });
    await expect(wallet.signMessage("msg", ADDRESS)).rejects.toThrow(/did not return a message signature/);

    localStorage.setItem("remitrelief_wallet_id", "freighter");
    kit.disconnect.mockRejectedValue({ code: -3, message: "Please set the wallet first" });
    await expect(wallet.disconnectWallet()).resolves.toBeUndefined();
    expect(localStorage.getItem("remitrelief_wallet_id")).toBeNull();
  });
});
