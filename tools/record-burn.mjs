import pg from "pg";
import { SolanaVerifier, tokenConfig } from "../server/social/tokens.mjs";
import {
  verifyBurn,
  acquiredTokens,
  verifyAcquisition,
} from "../server/social/treasury.mjs";
// Deliberately no keys or signing. Execute reviewed transactions externally, then verify/record.
const [recordId, dexSignature, burnSignature] = process.argv.slice(2);
if (!recordId || !dexSignature || !burnSignature)
  throw new Error(
    "Usage: npm run treasury:record -- QUEUE_ID ACQUISITION_SIGNATURE BURN_SIGNATURE",
  );
const config = tokenConfig();
if (config.mock || !process.env.CADENCE_TOKEN_MINT)
  throw new Error("Real token configuration and CADENCE_TOKEN_MINT required");
const verifier = new SolanaVerifier(config);
await verifier.validateMint();
const [dex, burn] = await Promise.all(
  [dexSignature, burnSignature].map((sig) =>
    verifier.rpc("getTransaction", [
      sig,
      {
        encoding: "jsonParsed",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      },
    ]),
  ),
);
if (dex?.transaction?.signatures?.[0] !== dexSignature)
  throw new Error("Acquisition signature mismatch");
if (!process.env.CADENCE_DEX_PROGRAM_ID)
  throw new Error("CADENCE_DEX_PROGRAM_ID must identify the reviewed DEX");
const acquired = acquiredTokens(dex, {
  mint: process.env.CADENCE_TOKEN_MINT,
  authority: config.treasury,
});
const amount = burn?.transaction?.message?.instructions?.find(
  (i) => i.parsed?.type === "burnChecked",
)?.parsed?.info?.tokenAmount?.amount;
if (!amount || BigInt(amount) > acquired)
  throw new Error("Burn must be covered by acquired tokens");
verifyBurn(burn, {
  mint: process.env.CADENCE_TOKEN_MINT,
  authority: config.treasury,
  amountRaw: amount,
  signature: burnSignature,
});
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tx = await pool.connect();
try {
  await tx.query("BEGIN");
  const q = (
    await tx.query(
      "SELECT q.*,r.mock FROM cadence_buyback_records q JOIN platform_revenue_records r ON r.id=q.revenue_id WHERE q.id=$1 AND q.status='queued' FOR UPDATE OF q",
      [recordId],
    )
  ).rows[0];
  if (!q || q.mock) throw new Error("Real queued revenue allocation required");
  const spent = verifyAcquisition(dex, {
    inputMint: config.mint,
    authority: config.treasury,
    programId: process.env.CADENCE_DEX_PROGRAM_ID,
    maxRaw: q.allocated_raw,
  });
  if (Number(burn.blockTime) < Number(dex.blockTime))
    throw new Error("Burn predates acquisition");
  await tx.query(
    "UPDATE cadence_buyback_records SET status='verified',dex_signature=$2,burn_signature=$3,acquired_raw=$4,burned_raw=$5,spent_raw=$6,verified_at=now() WHERE id=$1",
    [
      recordId,
      dexSignature,
      burnSignature,
      acquired.toString(),
      amount,
      spent.toString(),
    ],
  );
  await tx.query("COMMIT");
  console.log(
    "Finalized acquisition and burn verified; allocation record updated. This tool submitted no transaction.",
  );
} catch (e) {
  await tx.query("ROLLBACK");
  throw e;
} finally {
  tx.release();
  await pool.end();
}
