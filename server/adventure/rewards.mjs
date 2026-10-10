import { randomUUID } from "node:crypto";
import { GameError, integer, calendarDay } from "../world/service.mjs";
import { SolanaVerifier } from "../social/tokens.mjs";
import { RESOURCE_VALUES, VENDORS } from "../../web/js/game/adventure.js";
const raw = (value) => {
  if (!/^\d+$/.test(String(value)))
    throw new GameError("Invalid raw token amount");
  return BigInt(value);
};
export class ResourceRewards {
  constructor(
    service,
    {
      mock = process.env.DEV_MODE === "true" &&
        process.env.MOCK_TOKEN_MODE === "true",
      dailyCap = process.env.MOCHI_DAILY_EARN_CAP_RAW,
      globalCap = process.env.RESOURCE_REWARD_DAILY_CAP_RAW,
      prices = process.env.RESOURCE_REWARD_PRICES_JSON,
    } = {},
  ) {
    this.service = service;
    this.pool = service.pool;
    this.mock = mock;
    this.id = mock ? "development-rewards" : "spl-rewards";
    this.dailyCap = raw(dailyCap || (mock ? "100000" : "0"));
    this.globalCap = raw(globalCap || (mock ? "1000000" : "0"));
    this.minimumAge = Number(
      process.env.RESOURCE_REWARD_MIN_ACCOUNT_AGE_MS?.trim() ||
        (mock ? "0" : "NaN"),
    );
    this.rewardWallet = process.env.RESOURCE_REWARD_TREASURY_WALLET;
    this.verifier =
      !mock && service.tokenConfig
        ? new SolanaVerifier(service.tokenConfig)
        : null;
    this.prices = mock ? RESOURCE_VALUES : JSON.parse(prices || "{}");
    for (const value of Object.values(this.prices)) raw(value);
  }
  async init() {
    if (!this.mock) {
      if (!this.rewardWallet || !this.service.tokenConfig?.mint) return;
      if (this.rewardWallet === this.service.tokenConfig.treasury)
        throw new Error(
          "Reward treasury must be separate from platform revenue",
        );
      const currency = {
        mint: this.service.tokenConfig.mint,
        network: this.service.tokenConfig.network,
        decimals: this.service.tokenConfig.decimals,
        wallet: this.rewardWallet,
      };
      await this.pool.query(
        "INSERT INTO reward_treasury(id,balance_raw,mode,currency) VALUES($1,0,'spl',$2) ON CONFLICT DO NOTHING",
        [this.id, currency],
      );
      const match = await this.pool.query(
        "SELECT id FROM reward_treasury WHERE id=$1 AND currency=$2::jsonb",
        [this.id, currency],
      );
      if (!match.rowCount)
        throw new Error(
          "Reward treasury currency configuration changed; reconcile before using another token or wallet",
        );
      return;
    }
    await this.service.transaction([], async (tx) => {
      await tx.query(
        "INSERT INTO reward_treasury(id,balance_raw,mode) VALUES($1,0,$2) ON CONFLICT DO NOTHING",
        [this.id, "mock"],
      );
      const r = await tx.query(
        "INSERT INTO reward_treasury_funding(id,treasury_id,amount_raw,reference) VALUES($1,$2,10000000,$3) ON CONFLICT(reference) DO NOTHING RETURNING id",
        [randomUUID(), this.id, "development-seed-v1"],
      );
      if (r.rowCount)
        await tx.query(
          "UPDATE reward_treasury SET balance_raw=balance_raw+10000000 WHERE id=$1",
          [this.id],
        );
    });
  }
  async balance(userId) {
    const rows = (
      await this.pool.query(
        "SELECT source,sum(amount_raw)::text AS amount_raw FROM game_reward_accruals WHERE user_id=$1 AND treasury_id=$2 AND claim_id IS NULL GROUP BY source",
        [userId, this.id],
      )
    ).rows;
    // Claimed/paid sales remain onboarding evidence after their balance is cleared.
    const sales = (
      await this.pool.query(
        "SELECT count(*)::integer AS wood_sales FROM game_reward_accruals WHERE user_id=$1 AND source='woodcutting'",
        [userId],
      )
    ).rows[0];
    const claims = (
      await this.pool.query(
        "SELECT id,amount_raw,status,created_at FROM game_reward_claims WHERE user_id=$1 AND treasury_id=$2 ORDER BY created_at DESC LIMIT 10",
        [userId, this.id],
      )
    ).rows;
    const treasury = (
      await this.pool.query(
        "SELECT balance_raw,liability_raw FROM reward_treasury WHERE id=$1",
        [this.id],
      )
    ).rows[0];
    return {
      claims,
      woodSales: sales?.wood_sales ?? 0,
      mock: this.mock,
      decimals: this.service.tokenConfig?.decimals ?? 6,
      prices: this.prices,
      amountRaw: rows.reduce((n, r) => n + raw(r.amount_raw), 0n).toString(),
      sources: rows,
      enabled:
        (this.mock ||
          (!!this.rewardWallet && Number.isFinite(this.minimumAge))) &&
        !!treasury &&
        this.dailyCap > 0n &&
        this.globalCap > 0n &&
        raw(treasury.balance_raw) > raw(treasury.liability_raw),
      dailyCapRaw: this.dailyCap.toString(),
      message: this.mock
        ? "TEST rewards, backed by a development pool. No on-chain funds."
        : "Treasury-backed $MOCHI liability; payouts require configured funding and a verified wallet.",
    };
  }
  async onChainFunds() {
    if (this.mock) return null;
    if (!this.verifier || !this.rewardWallet)
      throw new GameError("Production reward treasury is not configured", 409);
    return this.verifier.balance(this.rewardWallet);
  }
  quote(vendor, items) {
    const v = VENDORS[vendor];
    if (!v) throw new GameError("Unknown resource buyer");
    let total = 0n;
    for (const [id, q] of Object.entries(items)) {
      integer(q, 1, 999);
      if (!v.items.includes(id))
        throw new GameError("This vendor does not buy that item");
      total += raw(this.prices[id] ?? 0) * BigInt(q);
    }
    if (total <= 0n) throw new GameError("Resource rewards are paused");
    return total;
  }
  async sell(userId, { vendor, items, id }, actor) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id ?? ""))
      throw new GameError("A unique sale ID is required");
    const v = VENDORS[vendor];
    if (
      !v ||
      actor?.roomId !== "town" ||
      Math.hypot(actor.x - v.x, actor.y - v.y) > 130
    )
      throw new GameError("Walk to the resource buyer first");
    if (
      !items ||
      typeof items !== "object" ||
      Array.isArray(items) ||
      !Object.keys(items).length ||
      Object.keys(items).length > 8
    )
      throw new GameError("Choose owned resources");
    if (
      !this.mock &&
      (!this.rewardWallet ||
        !Number.isFinite(this.minimumAge) ||
        this.minimumAge < 0)
    )
      throw new GameError(
        "Production reward eligibility is not configured",
        409,
      );
    const amount = this.quote(vendor, items);
    const onChain = await this.onChainFunds();
    return this.service.transaction([userId], async (tx) => {
      if (
        (
          await tx.query("SELECT id FROM game_reward_accruals WHERE id=$1", [
            id,
          ])
        ).rowCount
      )
        throw new GameError("Sale already recorded", 409);
      const t = (
        await tx.query("SELECT * FROM reward_treasury WHERE id=$1 FOR UPDATE", [
          this.id,
        ])
      ).rows[0];
      if (onChain !== null && t && onChain < raw(t.balance_raw))
        throw new GameError(
          "Reward treasury needs reconciliation; payouts paused",
          409,
        );
      if (!t || amount > raw(t.balance_raw) - raw(t.liability_raw))
        throw new GameError(
          "Resource rewards paused: reward pool exhausted",
          409,
        );
      if (!this.mock) {
        const user = (
          await tx.query("SELECT created_at FROM users WHERE id=$1", [userId])
        ).rows[0];
        if (
          this.service.now() - new Date(user.created_at).getTime() <
          this.minimumAge
        )
          throw new GameError(
            "This account is not yet eligible for token rewards",
            409,
          );
      }
      if (
        !this.mock &&
        !(
          await tx.query("SELECT 1 FROM connected_wallets WHERE user_id=$1", [
            userId,
          ])
        ).rowCount
      )
        throw new GameError(
          "Verify a receiving wallet before earning token rewards",
          409,
        );
      const day = calendarDay(this.service.now());
      const sums = (
        await tx.query(
          "SELECT coalesce(sum(amount_raw) FILTER(WHERE user_id=$1),0)::text AS own,coalesce(sum(amount_raw),0)::text AS total FROM game_reward_accruals WHERE day=$2 AND treasury_id=$3",
          [userId, day, this.id],
        )
      ).rows[0];
      if (
        raw(sums.own) + amount > this.dailyCap ||
        raw(sums.total) + amount > this.globalCap
      )
        throw new GameError(
          "Daily resource reward limit reached; keep resources for tomorrow",
          409,
        );
      const recent = (
        await tx.query(
          "SELECT 1 FROM game_reward_accruals WHERE user_id=$1 AND created_at>$2 LIMIT 1",
          [userId, new Date(this.service.now() - 2000)],
        )
      ).rowCount;
      if (recent)
        throw new GameError("Wait briefly between resource sales", 429);
      for (const [item, q] of Object.entries(items))
        await this.service.inventory(tx, userId, item, -q);
      await tx.query(
        "INSERT INTO game_reward_accruals(id,user_id,treasury_id,amount_raw,source,items,day,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          userId,
          this.id,
          amount.toString(),
          v.kind,
          items,
          day,
          new Date(this.service.now()),
        ],
      );
      await tx.query(
        "UPDATE reward_treasury SET liability_raw=liability_raw+$2 WHERE id=$1",
        [this.id, amount.toString()],
      );
      return {
        amountRaw: amount.toString(),
        mock: this.mock,
        message: "Added to treasury-backed claimable rewards.",
      };
    });
  }
  async claim(userId, { id }) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id ?? ""))
      throw new GameError("A unique claim ID is required");
    const onChain = await this.onChainFunds();
    return this.service.transaction([userId], async (tx) => {
      const t = (
        await tx.query("SELECT * FROM reward_treasury WHERE id=$1 FOR UPDATE", [
          this.id,
        ])
      ).rows[0];
      if (!t) throw new GameError("Rewards are not configured");
      if (onChain !== null && onChain < raw(t.balance_raw))
        throw new GameError(
          "Reward treasury needs reconciliation; claim paused",
          409,
        );
      if (
        (await tx.query("SELECT id FROM game_reward_claims WHERE id=$1", [id]))
          .rowCount
      )
        throw new GameError("Claim already submitted", 409);
      if (
        (
          await tx.query(
            "SELECT 1 FROM game_reward_claims WHERE user_id=$1 AND status='pending'",
            [userId],
          )
        ).rowCount
      )
        throw new GameError("A payout is already pending", 409);
      const amount = raw(
        (
          await tx.query(
            "SELECT coalesce(sum(amount_raw),0)::text AS total FROM game_reward_accruals WHERE user_id=$1 AND treasury_id=$2 AND claim_id IS NULL",
            [userId, this.id],
          )
        ).rows[0].total,
      );
      if (!amount) throw new GameError("No unclaimed rewards", 409);
      const wallet = (
        await tx.query(
          "SELECT public_key FROM connected_wallets WHERE user_id=$1 ORDER BY verified_at DESC LIMIT 1",
          [userId],
        )
      ).rows[0]?.public_key;
      if (!this.mock && !wallet)
        throw new GameError("Connect and verify a receiving wallet", 409);
      if (amount > raw(t.liability_raw) || amount > raw(t.balance_raw))
        throw new GameError("Treasury reconciliation required", 409);
      await tx.query(
        "INSERT INTO game_reward_claims(id,user_id,treasury_id,amount_raw,wallet,status) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          userId,
          this.id,
          amount.toString(),
          wallet ?? "development-wallet",
          "pending",
        ],
      );
      await tx.query(
        "UPDATE game_reward_accruals SET claim_id=$2 WHERE user_id=$1 AND treasury_id=$3 AND claim_id IS NULL",
        [userId, id, this.id],
      );
      if (this.mock) {
        await tx.query(
          "INSERT INTO game_reward_payouts(id,claim_id,amount_raw,signature,mode) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), id, amount.toString(), "mock:" + id, "mock"],
        );
        await tx.query(
          "UPDATE reward_treasury SET balance_raw=balance_raw-$2,liability_raw=liability_raw-$2 WHERE id=$1",
          [this.id, amount.toString()],
        );
        await tx.query(
          "UPDATE game_reward_claims SET status='paid' WHERE id=$1",
          [id],
        );
        await tx.query(
          "INSERT INTO mock_token_balances(user_id,amount_raw) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET amount_raw=mock_token_balances.amount_raw+$2",
          [userId, amount.toString()],
        );
        await tx.query(
          "INSERT INTO mock_token_ledger(id,user_id,amount_raw,type) VALUES($1,$2,$3,'resource-reward')",
          [randomUUID(), userId, amount.toString()],
        );
      }
      return {
        id,
        amountRaw: amount.toString(),
        status: this.mock ? "paid" : "pending",
        mock: this.mock,
        message: this.mock
          ? "TEST payout added to development wallet."
          : "Claim reserved for treasury payout. No production transfer worker is configured.",
      };
    });
  }
}
