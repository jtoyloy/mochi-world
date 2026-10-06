import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyBurn,
  verifyAcquisition,
  acquiredTokens,
} from "../../server/social/treasury.mjs";
function burnTx() {
  return {
    blockTime: 1000,
    transaction: {
      signatures: ["burn"],
      message: {
        accountKeys: [
          { pubkey: "treasury", signer: true },
          { pubkey: "cadence-account" },
        ],
        instructions: [
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsed: {
              type: "burnChecked",
              info: {
                mint: "cadence",
                authority: "treasury",
                account: "cadence-account",
                tokenAmount: { amount: "200", decimals: 6 },
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
          mint: "cadence",
          owner: "treasury",
          uiTokenAmount: { amount: "250" },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: "cadence",
          owner: "treasury",
          uiTokenAmount: { amount: "50" },
        },
      ],
    },
  };
}
test("burn verification requires actual checked mint/authority/signature and exact balance decrease", () => {
  const t = burnTx(),
    expected = {
      mint: "cadence",
      authority: "treasury",
      amountRaw: "200",
      signature: "burn",
    };
  assert(verifyBurn(t, expected));
  for (const change of [
    (t) => (t.meta.err = { failed: true }),
    (t) => (t.transaction.message.instructions[0].parsed.info.mint = "other"),
    (t) => (t.transaction.message.accountKeys[0].signer = false),
    (t) => (t.meta.postTokenBalances[0].uiTokenAmount.amount = "100"),
  ]) {
    const bad = structuredClone(t);
    change(bad);
    assert.throws(() => verifyBurn(bad, expected));
  }
  assert.throws(() => verifyBurn(t, { ...expected, signature: null }));
});
test("buyback verification requires reviewed DEX, real acquisition and spend within allocated amount", () => {
  const t = {
    transaction: {
      message: {
        accountKeys: [{ pubkey: "treasury", signer: true }],
        instructions: [{ programId: "reviewed-dex" }],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [
        { mint: "mochi", owner: "treasury", uiTokenAmount: { amount: "1000" } },
      ],
      postTokenBalances: [
        { mint: "mochi", owner: "treasury", uiTokenAmount: { amount: "500" } },
        {
          mint: "cadence",
          owner: "treasury",
          uiTokenAmount: { amount: "250" },
        },
      ],
    },
  };
  assert.equal(
    verifyAcquisition(t, {
      inputMint: "mochi",
      authority: "treasury",
      programId: "reviewed-dex",
      maxRaw: "600",
    }),
    500n,
  );
  assert.equal(
    acquiredTokens(t, { mint: "cadence", authority: "treasury" }),
    250n,
  );
  assert.throws(() =>
    verifyAcquisition(t, {
      inputMint: "mochi",
      authority: "treasury",
      programId: "wrong",
      maxRaw: "600",
    }),
  );
  assert.throws(() =>
    verifyAcquisition(t, {
      inputMint: "mochi",
      authority: "treasury",
      programId: "reviewed-dex",
      maxRaw: "100",
    }),
  );
  assert.throws(() =>
    acquiredTokens(t, { mint: "cadence", authority: "other" }),
  );
});
