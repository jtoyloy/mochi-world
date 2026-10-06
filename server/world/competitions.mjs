import { randomUUID } from "node:crypto";
import { newPortfolio, portfolioValue } from "../../web/js/traders/trading.js";
import { calendarDay, GameError } from "./service.mjs";
export class Competitions {
  constructor(service) {
    this.service = service;
    this.pool = service.pool;
  }
  async daily() {
    const now = this.service.now(),
      day = calendarDay(now),
      id = "cup-" + day;
    const midnight = (day) => {
      const guess = Date.parse(day + "T00:00:00Z");
      let stamp = guess;
      for (let i = 0; i < 3; i++) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: process.env.GAME_TIMEZONE ?? "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).formatToParts(new Date(stamp));
        const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        const local = Date.parse(
          `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}Z`,
        );
        stamp += guess - local;
      }
      return new Date(stamp);
    };
    const start = midnight(day),
      end = midnight(
        new Date(Date.parse(day + "T12:00:00Z") + 86400000)
          .toISOString()
          .slice(0, 10),
      );
    const config = {
      startingBalance: 10000,
      first: 1000,
      top10: 500,
      top100: 200,
      participation: 25,
      minimumForPodium: 3,
    };
    await this.pool.query(
      "INSERT INTO competitions(id,name,starts_at,ends_at,config) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [id, "Mochi City Daily Paper Cup", start, end, config],
    );
    return (
      await this.pool.query("SELECT * FROM competitions WHERE id=$1", [id])
    ).rows[0];
  }
  async enter(userId, mochiId) {
    const competition = await this.daily();
    return this.service.transaction([userId], async (tx) => {
      await this.service.owner(tx, userId, mochiId);
      await tx.query(
        "UPDATE mochis SET state=jsonb_set(state,'{serverNextTick}','0') WHERE id=$1",
        [mochiId],
      );
      if (this.service.now() >= new Date(competition.ends_at).getTime())
        throw new GameError("This cup has closed");
      if (
        (
          await tx.query(
            "SELECT 1 FROM competition_entries WHERE competition_id=$1 AND user_id=$2",
            [competition.id, userId],
          )
        ).rows.length
      )
        throw new GameError("One Mochi per player per cup");
      await tx.query(
        "INSERT INTO competition_entries(competition_id,mochi_id,user_id,portfolio) VALUES($1,$2,$3,$4)",
        [competition.id, mochiId, userId, newPortfolio()],
      );
      await this.service.event(tx, userId, "competition", {
        message: "Your Mochi entered the Daily Paper Cup.",
        competitionId: competition.id,
      });
      return {
        message:
          "Your Mochi is entered. Only server-run Cadence decisions count.",
      };
    });
  }
  async view() {
    const cup = await this.daily();
    await this.settle();
    const rows = (
      await this.pool.query(
        "SELECT e.*,m.name,u.username FROM competition_entries e JOIN mochis m ON m.id=e.mochi_id JOIN users u ON u.id=e.user_id WHERE e.competition_id=$1",
        [cup.id],
      )
    ).rows;
    return {
      cup,
      entries: rows
        .map((r) => ({
          mochiId: r.mochi_id,
          name: r.name,
          username: r.username,
          value: portfolioValue(r.portfolio),
          returnPct:
            100 *
            (portfolioValue(r.portfolio) / r.portfolio.startingBalance - 1),
          trades: r.trades.length,
          rank: r.rank,
          reward: r.reward,
        }))
        .sort((a, b) => b.returnPct - a.returnPct),
    };
  }
  async settle() {
    const closed = (
      await this.pool.query(
        "SELECT id FROM competitions WHERE status='open' AND ends_at<=$1",
        [new Date(this.service.now())],
      )
    ).rows;
    for (const { id } of closed) {
      const ids = (
        await this.pool.query(
          "SELECT user_id FROM competition_entries WHERE competition_id=$1",
          [id],
        )
      ).rows.map((x) => x.user_id);
      await this.service.transaction(ids, async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "competition:" + id,
        ]);
        const cup = (
          await tx.query("SELECT * FROM competitions WHERE id=$1 FOR UPDATE", [
            id,
          ])
        ).rows[0];
        if (cup.status !== "open") return;
        const entries = (
          await tx.query(
            "SELECT * FROM competition_entries WHERE competition_id=$1 ORDER BY mochi_id FOR UPDATE",
            [id],
          )
        ).rows.sort(
          (a, b) => portfolioValue(b.portfolio) - portfolioValue(a.portfolio),
        );
        for (const [i, e] of entries.entries()) {
          if (e.settled_at) continue;
          const rank = i + 1,
            config = cup.config,
            hasPodium = entries.length >= config.minimumForPodium;
          const reward = hasPodium
            ? rank === 1
              ? config.first
              : rank <= 10
                ? config.top10
                : rank <= 100
                  ? config.top100
                  : config.participation
            : config.participation;
          await this.service.coins(
            tx,
            e.user_id,
            reward,
            "competition_reward",
            { competitionId: id, rank, participants: entries.length },
          );
          await tx.query(
            "UPDATE competition_entries SET rank=$3,reward=$4,settled_at=now() WHERE competition_id=$1 AND mochi_id=$2",
            [id, e.mochi_id, rank, reward],
          );
          if (rank === 1 && hasPodium) {
            await tx.query(
              "INSERT INTO mochi_trophies(mochi_id,trophy_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [e.mochi_id, "sol-cup-gold"],
            );
            await tx.query(
              "INSERT INTO user_trophies(user_id,trophy_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [e.user_id, "sol-cup-gold"],
            );
          }
          await this.service.event(tx, e.user_id, "competition_result", {
            message: `Paper Cup finished: rank ${rank}, +${reward} Coins.`,
            competitionId: id,
            rank,
            reward,
          });
        }
        await tx.query(
          "UPDATE competitions SET status='finished' WHERE id=$1",
          [id],
        );
      });
    }
  }
}
