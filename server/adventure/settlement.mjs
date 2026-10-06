import { randomUUID } from "node:crypto";
import { GameError } from "../world/service.mjs";
import { validateTransfer } from "../social/tokens.mjs";
/** Records already finalized transfers. This module never holds keys or signs. */
export function rewardTransferIntent(
  config,
  {
    id,
    sender,
    recipient,
    amountRaw,
    createdAt = 0,
    expiresAt = Date.now() + 1000,
  },
) {
  if (!config.rewardWallet || config.rewardWallet === config.treasury)
    throw new GameError("A separate reward treasury wallet is required");
  return {
    id,
    sender,
    recipient,
    mint: config.mint,
    decimals: config.decimals,
    amount_raw: String(amountRaw),
    created_at: new Date(createdAt),
    expires_at: new Date(expiresAt),
  };
}
export async function recordRewardFunding(
  service,
  config,
  { id, sender, amountRaw, signature, transaction },
) {
  if (
    config.mock ||
    !/^\d+$/.test(String(amountRaw)) ||
    BigInt(amountRaw) <= 0n
  )
    throw new GameError("Verified production funding required");
  validateTransfer(
    rewardTransferIntent(config, {
      id,
      sender,
      recipient: config.rewardWallet,
      amountRaw,
    }),
    transaction,
    signature,
  );
  return service.transaction([], async (tx) => {
    const currency = {
      mint: config.mint,
      network: config.network,
      decimals: config.decimals,
      wallet: config.rewardWallet,
    };
    await tx.query(
      "INSERT INTO reward_treasury(id,balance_raw,mode,currency) VALUES('spl-rewards',0,'spl',$1) ON CONFLICT DO NOTHING",
      [currency],
    );
    if (
      !(
        await tx.query(
          "SELECT id FROM reward_treasury WHERE id='spl-rewards' AND currency=$1::jsonb",
          [currency],
        )
      ).rowCount
    )
      throw new GameError("Reward treasury currency mismatch");
    await tx.query(
      "SELECT id FROM reward_treasury WHERE id='spl-rewards' FOR UPDATE",
    );
    await tx.query(
      "INSERT INTO reward_treasury_funding(id,treasury_id,amount_raw,reference) VALUES($1,'spl-rewards',$2,$3)",
      [id, String(amountRaw), signature],
    );
    await tx.query(
      "UPDATE reward_treasury SET balance_raw=balance_raw+$1 WHERE id='spl-rewards'",
      [String(amountRaw)],
    );
    return { id, amountRaw: String(amountRaw) };
  });
}
export async function recordRewardPayout(
  service,
  config,
  { claimId, signature, transaction },
) {
  if (config.mock)
    throw new GameError("This verifier records production payouts only");
  return service.transaction([], async (tx) => {
    const t = (
      await tx.query(
        "SELECT * FROM reward_treasury WHERE id='spl-rewards' FOR UPDATE",
      )
    ).rows[0];
    const claim = (
      await tx.query(
        "SELECT * FROM game_reward_claims WHERE id=$1 AND treasury_id='spl-rewards' FOR UPDATE",
        [claimId],
      )
    ).rows[0];
    if (
      t &&
      JSON.stringify({
        mint: config.mint,
        network: config.network,
        decimals: config.decimals,
        wallet: config.rewardWallet,
      }) !==
        JSON.stringify({
          mint: t.currency.mint,
          network: t.currency.network,
          decimals: t.currency.decimals,
          wallet: t.currency.wallet,
        })
    )
      throw new GameError("Reward treasury currency mismatch");
    if (!claim || claim.status !== "pending" || !t)
      throw new GameError("A pending funded production claim is required");
    validateTransfer(
      rewardTransferIntent(config, {
        id: claim.id,
        sender: config.rewardWallet,
        recipient: claim.wallet,
        amountRaw: claim.amount_raw,
        createdAt: new Date(claim.created_at).getTime(),
      }),
      transaction,
      signature,
    );
    await tx.query(
      "INSERT INTO game_reward_payouts(id,claim_id,amount_raw,signature,mode) VALUES($1,$2,$3,$4,'spl')",
      [randomUUID(), claimId, claim.amount_raw, signature],
    );
    await tx.query("UPDATE game_reward_claims SET status='paid' WHERE id=$1", [
      claimId,
    ]);
    await tx.query(
      "UPDATE reward_treasury SET balance_raw=balance_raw-$1,liability_raw=liability_raw-$1 WHERE id='spl-rewards'",
      [claim.amount_raw],
    );
    return { claimId, status: "paid", amountRaw: claim.amount_raw };
  });
}
