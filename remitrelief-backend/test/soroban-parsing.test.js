import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  Asset,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import {
  assertExpectedInvocation,
  extractContractInvocations,
  verifyMilestoneVerificationTransaction,
} from "../src/blockchain/soroban/verification.js";
import { normalizeEvent } from "../src/blockchain/soroban/events.js";

const ESCROW = StrKey.encodeContract(Buffer.alloc(32, 7));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));

function buildTx(source, operation) {
  const built = new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();
  // Round-trip through XDR so parsing matches what the wallet/RPC hands back.
  return TransactionBuilder.fromXDR(built.toXDR(), Networks.TESTNET);
}

function depositTx(donor, amount, contractId = ESCROW) {
  return buildTx(
    donor,
    new Contract(contractId).call(
      "deposit",
      new Address(donor.publicKey()).toScVal(),
      nativeToScVal(amount, { type: "i128" })
    )
  );
}

function roundTripScVal(scVal) {
  return xdr.ScVal.fromXDR(scVal.toXDR("base64"), "base64");
}

describe("Soroban transaction parsing (stellar-sdk 17 XDR)", () => {
  const donor = Keypair.random();

  it("extracts contract id, function name and args from invokeHostFunction ops", () => {
    const [invocation, ...rest] = extractContractInvocations(depositTx(donor, 5_000_000));
    assert.equal(rest.length, 0);
    assert.equal(invocation.contractId, ESCROW);
    assert.equal(invocation.functionName, "deposit");
    assert.equal(invocation.args.length, 2);
  });

  it("accepts a deposit matching escrow, donor and amount", () => {
    const match = assertExpectedInvocation(depositTx(donor, 5_000_000), {
      escrowAddress: ESCROW,
      functionName: "deposit",
      expectedArgs: { address: donor.publicKey(), amountStroops: 5_000_000 },
    });
    assert.equal(match.functionName, "deposit");
  });

  it("rejects the wrong contract, function, donor or amount", () => {
    const tx = depositTx(donor, 5_000_000);
    const expectInvalid = (options) =>
      assert.throws(() => assertExpectedInvocation(tx, options), { code: "INVALID_CONTRACT_CALL" });

    expectInvalid({ escrowAddress: OTHER_CONTRACT, functionName: "deposit" });
    expectInvalid({ escrowAddress: ESCROW, functionName: "release" });
    expectInvalid({ escrowAddress: ESCROW, functionName: "dep" });
    expectInvalid({
      escrowAddress: ESCROW,
      functionName: "deposit",
      expectedArgs: { address: Keypair.random().publicKey() },
    });
    expectInvalid({
      escrowAddress: ESCROW,
      functionName: "deposit",
      expectedArgs: { address: donor.publicKey(), amountStroops: 1 },
    });
  });

  it("rejects transactions that do not invoke a contract", () => {
    const payment = buildTx(
      donor,
      Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: "1" })
    );
    assert.equal(extractContractInvocations(payment).length, 0);
    assert.throws(
      () => assertExpectedInvocation(payment, { escrowAddress: ESCROW, functionName: "deposit" }),
      { code: "INVALID_CONTRACT_CALL" }
    );
  });

  it("validates signed verify_milestone XDR including the milestone index", () => {
    const verifier = Keypair.random();
    const tx = buildTx(
      verifier,
      new Contract(ESCROW).call(
        "verify_milestone",
        new Address(verifier.publicKey()).toScVal(),
        nativeToScVal(2, { type: "u32" })
      )
    );
    tx.sign(verifier);
    const signedXdr = tx.toXDR();

    const { valid } = verifyMilestoneVerificationTransaction({
      signedXdr,
      escrowAddress: ESCROW,
      milestoneIndex: 2,
      verifierPublicKey: verifier.publicKey(),
    });
    assert.equal(valid, true);

    assert.throws(
      () =>
        verifyMilestoneVerificationTransaction({
          signedXdr,
          escrowAddress: ESCROW,
          milestoneIndex: 1,
          verifierPublicKey: verifier.publicKey(),
        }),
      { code: "INVALID_CONTRACT_CALL" }
    );
  });

  it("normalizes RPC-parsed events whose topics and values are ScVals", () => {
    const deposit = normalizeEvent({
      contractId: new Contract(ESCROW),
      topic: [
        roundTripScVal(nativeToScVal("deposit", { type: "symbol" })),
        roundTripScVal(new Address(donor.publicKey()).toScVal()),
      ],
      value: roundTripScVal(nativeToScVal([250n, 1000n], { type: ["i128", "i128"] })),
      txHash: "tx-deposit-scval",
    });
    assert.equal(deposit.type, "donation");
    assert.equal(deposit.amount, 250);
    assert.equal(deposit.contractId, ESCROW);
    assert.deepEqual(deposit.topics, ["deposit", donor.publicKey()]);

    const release = normalizeEvent({
      topic: [
        roundTripScVal(nativeToScVal("release", { type: "symbol" })),
        roundTripScVal(nativeToScVal(1, { type: "u32" })),
      ],
      value: roundTripScVal(nativeToScVal(40n, { type: "i128" })),
      txHash: "tx-release-scval",
    });
    assert.equal(release.type, "release");
    assert.equal(release.milestoneIndex, 1);
    assert.equal(release.amount, 40);
  });
});
