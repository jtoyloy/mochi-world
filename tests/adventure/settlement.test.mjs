import { test } from "node:test";
import assert from "node:assert/strict";
import { rewardTransferIntent } from "../../server/adventure/settlement.mjs";
import { validateTransfer } from "../../server/social/tokens.mjs";
const config = {
  mint: "mochi-mint",
  decimals: 6,
  treasury: "payment-treasury",
  rewardWallet: "reward-treasury",
};
const intent = () =>
  rewardTransferIntent(config, {
    id: "claim-123",
    sender: "reward-treasury",
    recipient: "verified-player-wallet",
    amountRaw: "1000",
    createdAt: 999000,
    expiresAt: 1001000,
  });
const tx = () => ({
  blockTime: 1000,
  transaction: {
    signatures: ["verified-signature"],
    message: {
      accountKeys: [
        { pubkey: "reward-treasury", signer: true },
        { pubkey: "source-account" },
        { pubkey: "recipient-account" },
      ],
      instructions: [
        {
          programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
          parsed: "mochi:claim-123",
        },
        {
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          parsed: {
            type: "transferChecked",
            info: {
              authority: "reward-treasury",
              source: "source-account",
              destination: "recipient-account",
              mint: "mochi-mint",
              tokenAmount: { amount: "1000", decimals: 6 },
            },
          },
        },
      ],
    },
  },
  meta: {
    err: null,
    preTokenBalances: [
      {
        accountIndex: 1,
        mint: "mochi-mint",
        owner: "reward-treasury",
        uiTokenAmount: { amount: "5000" },
      },
      {
        accountIndex: 2,
        mint: "mochi-mint",
        owner: "verified-player-wallet",
        uiTokenAmount: { amount: "0" },
      },
    ],
    postTokenBalances: [
      {
        accountIndex: 1,
        mint: "mochi-mint",
        owner: "reward-treasury",
        uiTokenAmount: { amount: "4000" },
      },
      {
        accountIndex: 2,
        mint: "mochi-mint",
        owner: "verified-player-wallet",
        uiTokenAmount: { amount: "1000" },
      },
    ],
  },
});
test("resource settlement binds memo, amount, verified owner, mint, decimals and treasury authority", () => {
  assert.doesNotThrow(() =>
    validateTransfer(intent(), tx(), "verified-signature"),
  );
  for (const change of [
    (t) => (t.meta.err = "failed"),
    (t) => (t.transaction.message.instructions[0].parsed = "mochi:other"),
    (t) =>
      (t.transaction.message.instructions[1].parsed.info.tokenAmount.amount =
        "100000"),
    (t) => (t.transaction.message.instructions[1].parsed.info.mint = "fake"),
    (t) =>
      (t.transaction.message.instructions[1].parsed.info.tokenAmount.decimals = 9),
    (t) => (t.meta.postTokenBalances[1].owner = "attacker"),
    (t) => (t.meta.postTokenBalances[1].uiTokenAmount.amount = "900"),
    (t) => (t.transaction.message.accountKeys[0].signer = false),
    (t) => (t.blockTime = 1),
  ]) {
    const t = tx();
    change(t);
    assert.throws(() => validateTransfer(intent(), t, "verified-signature"));
  }
  assert.throws(() =>
    validateTransfer(intent(), tx(), "replayed-wrong-signature"),
  );
});
test("reward treasury cannot reuse the platform payment treasury or omit its identity", () => {
  assert.throws(
    () =>
      rewardTransferIntent(
        { ...config, rewardWallet: config.treasury },
        { id: "x" },
      ),
    /separate/,
  );
  assert.throws(
    () => rewardTransferIntent({ ...config, rewardWallet: "" }, { id: "x" }),
    /separate/,
  );
});
