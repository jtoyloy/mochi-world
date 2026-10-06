import { GameError } from "../world/service.mjs";
// Read-only chain verification. Recording is an offline admin operation, never a web hot wallet.
export function verifyBurn(
  transaction,
  { mint, authority, amountRaw, signature },
) {
  if (
    !mint ||
    !authority ||
    !signature ||
    !transaction?.meta ||
    transaction.meta.err
  )
    throw new GameError("A successful finalized burn transaction is required");
  if (transaction.transaction.signatures[0] !== signature)
    throw new GameError("Burn signature mismatch");
  const keys = transaction.transaction.message.accountKeys;
  if (!keys.some((k) => k.pubkey === authority && k.signer))
    throw new GameError("Burn authority did not sign");
  const burns = transaction.transaction.message.instructions.filter(
    (i) =>
      i.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      i.parsed?.type === "burnChecked",
  );
  if (burns.length !== 1) throw new GameError("Expected one checked SPL burn");
  const info = burns[0].parsed.info;
  if (
    info.mint !== mint ||
    info.authority !== authority ||
    info.tokenAmount.amount !== String(amountRaw)
  )
    throw new GameError("Burn mint, authority or amount mismatch");
  const index = keys.findIndex((k) => k.pubkey === info.account);
  const before = transaction.meta.preTokenBalances.find(
      (b) =>
        b.accountIndex === index && b.mint === mint && b.owner === authority,
    ),
    after = transaction.meta.postTokenBalances.find(
      (b) => b.accountIndex === index,
    );
  if (
    !before ||
    BigInt(before.uiTokenAmount.amount) -
      BigInt(after?.uiTokenAmount.amount ?? "0") !==
      BigInt(amountRaw)
  )
    throw new GameError("Burn balance delta mismatch");
  return true;
}
export function acquiredTokens(transaction, { mint, authority }) {
  if (!transaction?.meta || transaction.meta.err)
    throw new GameError("Finalized acquisition transaction required");
  const sum = (rows) =>
    rows
      .filter((b) => b.mint === mint && b.owner === authority)
      .reduce((v, b) => v + BigInt(b.uiTokenAmount.amount), 0n);
  const amount =
    sum(transaction.meta.postTokenBalances ?? []) -
    sum(transaction.meta.preTokenBalances ?? []);
  if (amount <= 0n) throw new GameError("No acquired CADENCE tokens");
  return amount;
}

export function verifyAcquisition(
  t,
  { inputMint, authority, programId, maxRaw },
) {
  if (!t?.meta || t.meta.err || !programId)
    throw new GameError("Reviewed DEX program is required");
  const keys = t.transaction.message.accountKeys;
  if (!keys.some((k) => k.pubkey === authority && k.signer))
    throw new GameError("Treasury did not sign acquisition");
  const calls = [
    ...t.transaction.message.instructions,
    ...(t.meta.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];
  if (!calls.some((i) => i.programId === programId))
    throw new GameError("Reviewed DEX was not called");
  const sum = (rows) =>
    (rows ?? [])
      .filter((b) => b.mint === inputMint && b.owner === authority)
      .reduce((v, b) => v + BigInt(b.uiTokenAmount.amount), 0n);
  const spent = sum(t.meta.preTokenBalances) - sum(t.meta.postTokenBalances);
  if (spent <= 0n || spent > BigInt(maxRaw))
    throw new GameError("Treasury spend exceeds allocation or is absent");
  return spent;
}
