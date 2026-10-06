import pg from "pg";
import { WorldService } from "../server/world/service.mjs";
import { tokenConfig, SolanaVerifier } from "../server/social/tokens.mjs";
import {
  recordRewardFunding,
  recordRewardPayout,
} from "../server/adventure/settlement.mjs";
const [mode, id, signature, sender, amountRaw] = process.argv.slice(2);
if (
  !["funding", "payout"].includes(mode) ||
  !id ||
  !signature ||
  (mode === "funding" && (!sender || !amountRaw))
)
  throw new Error(
    "Usage: rewards:record -- funding FUND_ID SIGNATURE SENDER AMOUNT_RAW | payout CLAIM_ID SIGNATURE",
  );
const config = {
  ...tokenConfig(),
  rewardWallet: process.env.RESOURCE_REWARD_TREASURY_WALLET,
};
if (
  config.mock ||
  !config.rewardWallet ||
  config.rewardWallet === config.treasury
)
  throw new Error("A separately configured real reward treasury is required");
const verifier = new SolanaVerifier(config);
await verifier.validateMint();
const transaction = await verifier.rpc("getTransaction", [
  signature,
  {
    encoding: "jsonParsed",
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  },
]);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  service = new WorldService(pool);
try {
  const result =
    mode === "funding"
      ? await recordRewardFunding(service, config, {
          id,
          sender,
          amountRaw,
          signature,
          transaction,
        })
      : await recordRewardPayout(service, config, {
          claimId: id,
          signature,
          transaction,
        });
  console.log(JSON.stringify(result));
  console.log(
    "Verified and recorded only. No transaction was signed or submitted.",
  );
} finally {
  await pool.end();
}
