import { randomUUID } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { GameError, integer, itemById } from "../world/service.mjs";
const pubkey = (key) => {
  try {
    if (bs58.decode(key).length !== 32) throw Error();
    return key;
  } catch {
    throw new GameError("Invalid Solana public key");
  }
};
export function tokenConfig(env = process.env) {
  const mock = env.MOCK_TOKEN_MODE === "true",
    network = env.SOLANA_NETWORK ?? "devnet";
  if (!["devnet", "mainnet-beta"].includes(network))
    throw new Error("SOLANA_NETWORK must be devnet or mainnet-beta");
  const decimals = Number(env.MOCHI_TOKEN_DECIMALS ?? 6);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error("Invalid token decimals");
  const bps = env.CADENCE_BUYBACK_BPS?.trim()
    ? Number(env.CADENCE_BUYBACK_BPS)
    : null;
  if (bps !== null && (!Number.isInteger(bps) || bps < 0 || bps > 10000))
    throw new Error("Invalid CADENCE_BUYBACK_BPS");
  const fee = Number(env.MARKETPLACE_FEE_BPS ?? 0);
  if (!Number.isInteger(fee) || fee < 0 || fee > 10000)
    throw new Error("Invalid marketplace fee");
  if (mock && env.DEV_MODE !== "true")
    throw new Error("Mock currency requires explicit DEV_MODE=true");
  if (!mock) {
    for (const key of [
      "SOLANA_RPC_URL",
      "MOCHI_TOKEN_MINT",
      "MOCHI_TREASURY_WALLET",
    ])
      if (!env[key]) throw new Error(`${key} is required outside mock mode`);
    pubkey(env.MOCHI_TOKEN_MINT);
    pubkey(env.MOCHI_TREASURY_WALLET);
    if (!/^https?:\/\//.test(env.SOLANA_RPC_URL))
      throw new Error("Invalid Solana RPC URL");
    if (network === "mainnet-beta" && env.ALLOW_MAINNET_PAYMENTS !== "true")
      throw new Error("Mainnet requires ALLOW_MAINNET_PAYMENTS=true");
    if (fee)
      throw new Error(
        "Real marketplace fee settlement needs split-payment support. Set MARKETPLACE_FEE_BPS=0.",
      );
  }
  if (env.CADENCE_TOKEN_MINT) pubkey(env.CADENCE_TOKEN_MINT);
  return {
    mock,
    network,
    decimals,
    bps,
    fee,
    mint: mock ? "MOCK_ONLY_NOT_A_TOKEN" : env.MOCHI_TOKEN_MINT,
    treasury: mock ? "MOCK_PLATFORM" : env.MOCHI_TREASURY_WALLET,
    rpc: env.SOLANA_RPC_URL,
  };
}
export const allocation = (amount, bps) =>
  bps === null ? null : (BigInt(amount) * BigInt(bps)) / 10000n;
export function formatToken(raw, decimals) {
  const n = BigInt(raw),
    scale = 10n ** BigInt(decimals);
  return `${n / scale}${
    decimals
      ? "." +
        String(n % scale)
          .padStart(decimals, "0")
          .replace(/0+$/, "")
      : ""
  }`.replace(/\.$/, "");
}
export class SolanaVerifier {
  constructor(config) {
    this.config = config;
  }
  async rpc(method, params) {
    const response = await fetch(this.config.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) throw new GameError("Solana RPC unavailable", 503);
    const r = await response.json();
    if (r.error) throw new GameError("Solana RPC rejected the request", 503);
    return r.result;
  }
  async validateMint() {
    const data = await this.rpc("getAccountInfo", [
      this.config.mint,
      { encoding: "jsonParsed", commitment: "finalized" },
    ]);
    const a = data?.value;
    if (
      a?.owner !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
      a.data?.parsed?.type !== "mint" ||
      a.data.parsed.info.decimals !== this.config.decimals
    )
      throw new Error(
        "Configured mint/decimals must identify a standard SPL mint",
      );
    const genesis = await this.rpc("getGenesisHash", []);
    const expected =
      this.config.network === "devnet"
        ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
        : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    if (genesis !== expected)
      throw new Error("RPC cluster does not match SOLANA_NETWORK");
  }
  async balance(wallet) {
    const r = await this.rpc("getTokenAccountsByOwner", [
      wallet,
      { mint: this.config.mint },
      { encoding: "jsonParsed", commitment: "finalized" },
    ]);
    return (r.value ?? []).reduce(
      (n, a) => n + BigInt(a.account.data.parsed.info.tokenAmount.amount),
      0n,
    );
  }
  async verify(intent, signature) {
    let bytes;
    try {
      bytes = bs58.decode(signature);
    } catch {}
    if (bytes?.length !== 64)
      throw new GameError("Invalid transaction signature");
    const t = await this.rpc("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    validateTransfer(intent, t, signature);
    return true;
  }
}
export function validateTransfer(intent, t, signature) {
  if (!t || !t.meta || t.meta.err)
    throw new GameError("Payment is not finalized successfully");
  if (t.transaction.signatures[0] !== signature)
    throw new GameError("Signature mismatch");
  const keys = t.transaction.message.accountKeys;
  if (!keys.some((k) => k.pubkey === intent.sender && k.signer))
    throw new GameError("Wrong payment sender");
  const blockTime = Number(t.blockTime) * 1000;
  if (
    !Number.isFinite(blockTime) ||
    blockTime < new Date(intent.created_at).getTime() - 2000 ||
    blockTime > new Date(intent.expires_at).getTime()
  )
    throw new GameError("Payment outside intent lifetime");
  const instructions = t.transaction.message.instructions;
  const memo = instructions.some(
    (i) =>
      i.programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" &&
      i.parsed === `mochi:${intent.id}`,
  );
  if (!memo) throw new GameError("Intent memo missing");
  const transfers = instructions.filter(
    (i) =>
      i.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      i.parsed?.type === "transferChecked",
  );
  if (transfers.length !== 1)
    throw new GameError("Expected one checked SPL transfer");
  const info = transfers[0].parsed.info;
  if (
    info.mint !== intent.mint ||
    info.tokenAmount.decimals !== intent.decimals
  )
    throw new GameError("Wrong token mint or decimals");
  if (info.tokenAmount.amount !== String(intent.amount_raw))
    throw new GameError("Wrong payment amount");
  if (info.authority !== intent.sender)
    throw new GameError("Wrong transfer authority");
  const destination = keys.findIndex((k) => k.pubkey === info.destination),
    source = keys.findIndex((k) => k.pubkey === info.source);
  const pre = t.meta.preTokenBalances ?? [],
    post = t.meta.postTokenBalances ?? [];
  const dst = post.find(
    (b) =>
      b.accountIndex === destination &&
      b.mint === intent.mint &&
      b.owner === intent.recipient,
  );
  const src = pre.find(
    (b) =>
      b.accountIndex === source &&
      b.mint === intent.mint &&
      b.owner === intent.sender,
  );
  if (!dst || !src)
    throw new GameError("Wrong recipient or source token account");
  const before =
    pre.find((b) => b.accountIndex === destination)?.uiTokenAmount.amount ??
    "0";
  const afterSrc =
    post.find((b) => b.accountIndex === source)?.uiTokenAmount.amount ?? "0";
  if (
    BigInt(dst.uiTokenAmount.amount) - BigInt(before) !==
      BigInt(intent.amount_raw) ||
    BigInt(src.uiTokenAmount.amount) - BigInt(afterSrc) !==
      BigInt(intent.amount_raw)
  )
    throw new GameError("Token balance deltas do not match payment");
}
export class TokenService {
  constructor(
    world,
    { config = tokenConfig(), verifier, now = () => Date.now() } = {},
  ) {
    this.world = world;
    this.pool = world.pool;
    this.config = config;
    this.verifier = verifier ?? new SolanaVerifier(config);
    this.now = now;
    this.balanceCache = new Map();
  }
  async init() {
    if (!this.config.mock) await this.verifier.validateMint();
  }
  async balance(userId, refresh = false) {
    const wallets = (
      await this.pool.query(
        "SELECT public_key FROM connected_wallets WHERE user_id=$1 ORDER BY verified_at",
        [userId],
      )
    ).rows;
    let raw;
    if (this.config.mock) {
      await this.pool.query(
        "INSERT INTO mock_token_balances(user_id,amount_raw) SELECT id,coins::numeric*$2::numeric FROM users WHERE id=$1 ON CONFLICT DO NOTHING",
        [userId, (10n ** BigInt(this.config.decimals)).toString()],
      );
      raw = (
        await this.pool.query(
          "SELECT amount_raw FROM mock_token_balances WHERE user_id=$1",
          [userId],
        )
      ).rows[0].amount_raw;
    } else {
      const cached = this.balanceCache.get(userId);
      if (!refresh && cached && this.now() - cached.at < 30000)
        raw = cached.raw;
      else {
        raw = (
          await Promise.all(
            wallets.map((w) => this.verifier.balance(w.public_key)),
          )
        )
          .reduce((a, b) => a + b, 0n)
          .toString();
        this.balanceCache.set(userId, { at: this.now(), raw });
      }
    }
    return {
      amountRaw: String(raw),
      formatted: formatToken(raw, this.config.decimals),
      decimals: this.config.decimals,
      mint: this.config.mint,
      mock: this.config.mock,
      network: this.config.network,
      wallets: wallets.map((w) => w.public_key),
      buybackBps: this.config.bps,
    };
  }
  async challenge(userId, publicKey, origin) {
    pubkey(publicKey);
    const id = randomUUID(),
      message = `Mochi World wallet link\nOrigin: ${origin}\nAccount: ${userId}\nWallet: ${publicKey}\nNonce: ${id}\nExpires: ${new Date(this.now() + 300000).toISOString()}\nThis signs a login proof only. No payment or transaction.`;
    await this.pool.query(
      "INSERT INTO wallet_challenges(id,user_id,public_key,message,expires_at) VALUES($1,$2,$3,$4,$5)",
      [id, userId, publicKey, message, new Date(this.now() + 300000)],
    );
    return { id, message };
  }
  async link(userId, { challengeId, signature }) {
    return this.world.transaction([userId], async (tx) => {
      const c = (
        await tx.query(
          "SELECT * FROM wallet_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [challengeId, userId],
        )
      ).rows[0];
      if (!c || c.used || new Date(c.expires_at).getTime() < this.now())
        throw new GameError("Wallet challenge expired or used");
      let sig;
      try {
        sig = bs58.decode(signature);
      } catch {}
      if (
        !sig ||
        !nacl.sign.detached.verify(
          Buffer.from(c.message),
          sig,
          bs58.decode(c.public_key),
        )
      )
        throw new GameError("Wallet signature did not verify");
      const old = (
        await tx.query(
          "SELECT user_id FROM connected_wallets WHERE public_key=$1",
          [c.public_key],
        )
      ).rows[0];
      if (old && old.user_id !== userId)
        throw new GameError("Wallet belongs to another account");
      await tx.query(
        "INSERT INTO connected_wallets(public_key,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [c.public_key, userId],
      );
      await tx.query("UPDATE wallet_challenges SET used=true WHERE id=$1", [
        c.id,
      ]);
      return { message: "Wallet ownership verified" };
    });
  }
  async restoreStock(tx, p) {
    const d = p.data;
    if (!d.shopId) return;
    await tx.query(
      "UPDATE shop_stock SET quantity=quantity+$3 WHERE shop_id=$1 AND item_id=$2 AND cycle=$4",
      [d.shopId, d.itemId, d.quantity, d.stockCycle],
    );
  }
  async expire(tx) {
    const expired = (
      await tx.query(
        "UPDATE token_payment_intents SET status='expired' WHERE status='pending' AND expires_at<$1 RETURNING *",
        [new Date(this.now())],
      )
    ).rows;
    for (const p of expired) await this.restoreStock(tx, p);
    await tx.query(
      "DELETE FROM listing_reservations WHERE expires_at<$1 OR intent_id IN (SELECT id FROM token_payment_intents WHERE status<>'pending')",
      [new Date(this.now())],
    );
  }

  async intent(userId, input) {
    integer(input.quantity ?? 1, 1, 50);
    await this.balance(userId);
    return this.world.transaction([userId], async (tx) => {
      await this.expire(tx);
      if (
        Number(
          (
            await tx.query(
              "SELECT count(*) AS n FROM token_payment_intents WHERE user_id=$1 AND status='pending'",
              [userId],
            )
          ).rows[0].n,
        ) >= 3
      )
        throw new GameError(
          "Finish or cancel your current checkouts first",
          429,
        );
      const quantity = input.quantity ?? 1;
      let price,
        itemId,
        sellerId = null,
        recipient = this.config.treasury,
        type,
        stockCycle = null;
      if (input.listingId) {
        const listing = (
          await tx.query(
            "SELECT * FROM player_shop_listings WHERE id=$1 FOR UPDATE",
            [input.listingId],
          )
        ).rows[0];
        if (
          !listing ||
          listing.quantity < quantity ||
          listing.seller_id === userId
        )
          throw new GameError("Listing unavailable");
        if (
          (
            await tx.query(
              "SELECT 1 FROM listing_reservations WHERE listing_id=$1",
              [listing.id],
            )
          ).rowCount
        )
          throw new GameError("Another player is checking out", 409);
        price = listing.price;
        itemId = listing.item_id;
        sellerId = listing.seller_id;
        type = "marketplace_purchase";
        if (!this.config.mock) {
          const w = (
            await tx.query(
              "SELECT public_key FROM connected_wallets WHERE user_id=$1 ORDER BY verified_at LIMIT 1",
              [sellerId],
            )
          ).rows[0];
          if (!w) throw new GameError("Seller needs a verified wallet");
          recipient = w.public_key;
        } else recipient = "MOCK_SELLER:" + sellerId;
      } else {
        const shop = await this.world.stock(tx, input.shopId);
        const row = (
          await tx.query(
            "SELECT * FROM shop_stock WHERE shop_id=$1 AND item_id=$2 FOR UPDATE",
            [shop.id, input.itemId],
          )
        ).rows[0];
        if (!row) throw new GameError("Item not sold here");
        if (row.quantity < quantity)
          throw new GameError("Sold out or reserved");
        await tx.query(
          "UPDATE shop_stock SET quantity=quantity-$3 WHERE shop_id=$1 AND item_id=$2",
          [shop.id, input.itemId, quantity],
        );
        price = row.price;
        itemId = row.item_id;
        stockCycle = row.cycle;
        type = "npc_purchase";
      }
      const wallet = (
        await tx.query(
          "SELECT public_key FROM connected_wallets WHERE user_id=$1 ORDER BY verified_at LIMIT 1",
          [userId],
        )
      ).rows[0];
      if (!this.config.mock && !wallet)
        throw new GameError("Connect and verify a wallet first");
      const id = randomUUID(),
        amount = (
          BigInt(price) *
          BigInt(quantity) *
          10n ** BigInt(this.config.decimals)
        ).toString(),
        data = {
          itemId,
          quantity,
          shopId: input.shopId ?? null,
          listingId: input.listingId ?? null,
          sellerId,
          stockCycle,
        };
      await tx.query(
        "INSERT INTO token_payment_intents(id,user_id,type,mint,decimals,amount_raw,recipient,sender,expires_at,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          id,
          userId,
          type,
          this.config.mint,
          this.config.decimals,
          amount,
          recipient,
          wallet?.public_key ?? "MOCK_USER:" + userId,
          new Date(this.now() + 300000),
          data,
          new Date(this.now()),
        ],
      );
      if (input.listingId)
        await tx.query(
          "INSERT INTO listing_reservations(listing_id,intent_id,expires_at) VALUES($1,$2,$3)",
          [input.listingId, id, new Date(this.now() + 300000)],
        );
      return {
        id,
        type,
        amountRaw: amount,
        formatted: formatToken(amount, this.config.decimals),
        mint: this.config.mint,
        decimals: this.config.decimals,
        recipient,
        sender: wallet?.public_key ?? null,
        memo: "mochi:" + id,
        expiresAt: new Date(this.now() + 300000).toISOString(),
        mock: this.config.mock,
        network: this.config.network,
      };
    });
  }
  async cancel(userId, id) {
    return this.world.transaction([userId], async (tx) => {
      const p = (
        await tx.query(
          "UPDATE token_payment_intents SET status='failed' WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *",
          [id, userId],
        )
      ).rows[0];
      if (p) await this.restoreStock(tx, p);
      await tx.query(
        "DELETE FROM listing_reservations WHERE intent_id=$1 AND intent_id IN (SELECT id FROM token_payment_intents WHERE user_id=$2 AND status='failed')",
        [id, userId],
      );
      return { message: "Checkout canceled" };
    });
  }

  async fulfill(userId, id, signature) {
    await this.world.transaction([], (tx) => this.expire(tx));
    const initial = (
      await this.pool.query(
        "SELECT * FROM token_payment_intents WHERE id=$1 AND user_id=$2",
        [id, userId],
      )
    ).rows[0];
    if (!initial) throw new GameError("Payment intent not found", 404);
    if (initial.status !== "pending")
      throw new GameError("Intent is already fulfilled or closed", 409);
    if (!this.config.mock) {
      try {
        await this.verifier.verify(initial, signature);
      } catch (e) {
        console.info(
          JSON.stringify({
            event: "token_payment_rejected",
            intentId: id,
            reason: e.message,
          }),
        );
        throw e;
      }
    }
    const seller = initial.data.sellerId;
    if (this.config.mock && seller) await this.balance(seller);
    return this.world.transaction(
      [userId, ...(seller ? [seller] : [])],
      async (tx) => {
        await this.expire(tx);
        const p = (
          await tx.query(
            "SELECT * FROM token_payment_intents WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (
          p.status !== "pending" ||
          new Date(p.expires_at).getTime() < this.now()
        )
          throw new GameError("Intent expired or already fulfilled", 409);
        const sig = this.config.mock ? "mock:" + id : signature;
        if (
          (
            await tx.query(
              "SELECT 1 FROM token_payment_intents WHERE signature=$1",
              [sig],
            )
          ).rowCount
        )
          throw new GameError("Transaction already used");
        const d = p.data;
        if (this.config.mock) {
          const balance = (
            await tx.query(
              "SELECT amount_raw FROM mock_token_balances WHERE user_id=$1 FOR UPDATE",
              [userId],
            )
          ).rows[0];
          if (BigInt(balance.amount_raw) < BigInt(p.amount_raw))
            throw new GameError("Not enough test tokens");
          await tx.query(
            "UPDATE mock_token_balances SET amount_raw=amount_raw-$2 WHERE user_id=$1",
            [userId, p.amount_raw],
          );
          await tx.query(
            "INSERT INTO mock_token_ledger(id,user_id,amount_raw,type,intent_id) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), userId, "-" + p.amount_raw, "purchase", id],
          );
        }
        if (d.listingId) {
          const listing = (
            await tx.query(
              "SELECT * FROM player_shop_listings WHERE id=$1 FOR UPDATE",
              [d.listingId],
            )
          ).rows[0];
          const reservation = (
            await tx.query(
              "SELECT * FROM listing_reservations WHERE listing_id=$1",
              [d.listingId],
            )
          ).rows[0];
          if (
            !listing ||
            listing.quantity < d.quantity ||
            reservation?.intent_id !== id
          )
            throw new GameError("Listing reservation lost");
          await tx.query(
            "DELETE FROM listing_reservations WHERE intent_id=$1",
            [id],
          );
          if (listing.quantity === d.quantity)
            await tx.query("DELETE FROM player_shop_listings WHERE id=$1", [
              d.listingId,
            ]);
          else
            await tx.query(
              "UPDATE player_shop_listings SET quantity=quantity-$2 WHERE id=$1",
              [d.listingId, d.quantity],
            );
          if (this.config.mock) {
            await tx.query(
              "INSERT INTO mock_token_balances(user_id,amount_raw) VALUES($1,0) ON CONFLICT DO NOTHING",
              [seller],
            );
            const fee =
              (BigInt(p.amount_raw) * BigInt(this.config.fee)) / 10000n;
            await tx.query(
              "UPDATE mock_token_balances SET amount_raw=amount_raw+$2 WHERE user_id=$1",
              [seller, (BigInt(p.amount_raw) - fee).toString()],
            );
            if (fee) await this.revenue(tx, id, "marketplace_fee", fee);
          }
          await this.world.event(tx, seller, "sale", {
            message:
              "Your item sold through verified " +
              (this.config.mock ? "test-token" : "SPL-token") +
              " checkout.",
          });
          console.info(
            JSON.stringify({ event: "marketplace_sale", intentId: id }),
          );
        } else {
          await this.revenue(tx, id, "npc_shop", BigInt(p.amount_raw));
        }
        await this.world.inventory(tx, userId, d.itemId, d.quantity);
        await this.world.collector(tx, userId);
        await tx.query(
          "UPDATE token_payment_intents SET status='confirmed',signature=$2 WHERE id=$1",
          [id, sig],
        );
        await this.world.event(tx, userId, "purchase", {
          message: `${itemById.get(d.itemId).name} joined your bag.`,
        });
        this.balanceCache.delete(userId);
        console.info(
          JSON.stringify({
            event: "token_payment_verified",
            intentId: id,
            mock: this.config.mock,
          }),
        );
        return { message: "Payment verified. Item delivered once." };
      },
    );
  }
  async revenue(tx, id, source, amount) {
    const a = allocation(amount, this.config.bps),
      record = randomUUID();
    await tx.query(
      "INSERT INTO platform_revenue_records(id,intent_id,source,token_mint,amount_raw,allocation_raw,allocation_bps,mock) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        record,
        id,
        source,
        this.config.mint,
        amount.toString(),
        a?.toString() ?? null,
        this.config.bps,
        this.config.mock,
      ],
    );
    if (a !== null && a > 0n)
      await tx.query(
        "INSERT INTO cadence_buyback_records(id,revenue_id,allocated_raw) VALUES($1,$2,$3)",
        [randomUUID(), record, a.toString()],
      );
  }
  async treasury() {
    const rows = (
      await this.pool.query(
        "SELECT source,token_mint,amount_raw,allocation_raw,allocation_bps,mock,created_at FROM platform_revenue_records ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
    const burns = (
      await this.pool.query(
        "SELECT dex_signature,burn_signature,acquired_raw,burned_raw,spent_raw,verified_at FROM cadence_buyback_records WHERE status='verified' ORDER BY verified_at DESC LIMIT 100",
      )
    ).rows;
    return {
      network: this.config.network,
      buybackBps: this.config.bps,
      records: rows,
      burns,
      execution:
        "Admin/multisig execution is not connected. No automated treasury trading.",
      cadenceMint: process.env.CADENCE_TOKEN_MINT ?? null,
    };
  }
}
