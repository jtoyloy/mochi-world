import { GameError } from "../world/service.mjs";
import { ITEMS } from "../../web/js/world/catalog.js";
import { plainText } from "../../web/js/game/model.js";
export class AvatarService {
  constructor(world) {
    this.world = world;
    this.pool = world.pool;
  }
  async get(userId) {
    await this.pool.query(
      "INSERT INTO player_avatars(user_id,display_name) SELECT id,display_name FROM users WHERE id=$1 ON CONFLICT DO NOTHING",
      [userId],
    );
    return (
      await this.pool.query("SELECT * FROM player_avatars WHERE user_id=$1", [
        userId,
      ])
    ).rows[0];
  }
  async update(userId, input) {
    await this.get(userId);
    return this.world.transaction([userId], async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM player_avatars WHERE user_id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0];
      if (input.displayName !== undefined) {
        const name = plainText(input.displayName, 24);
        if (!name) throw new GameError("Choose a display name");
        row.display_name = name;
      }
      if (input.bodyColor !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(input.bodyColor))
          throw new GameError("Choose a valid color");
        row.body_color = input.bodyColor;
      }
      if (input.style !== undefined) {
        if (!["classic", "curly"].includes(input.style))
          throw new GameError("Choose a supported character style");
        row.appearance = { ...(row.appearance ?? {}), style: input.style };
      }
      if (input.slot !== undefined) {
        if (
          !["hat", "face", "top", "accessory", "back", "hand", "feet"].includes(
            input.slot,
          )
        )
          throw new GameError("Unknown cosmetic layer");
        if (input.itemId) {
          const item = ITEMS.find((i) => i.id === input.itemId);
          if (!item || item.category !== "clothing")
            throw new GameError("Choose a clothing item");
          const owned = (
            await tx.query(
              "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location='bag'",
              [userId, input.itemId],
            )
          ).rows[0];
          if (!owned?.quantity)
            throw new GameError("This cosmetic is not in your bag");
          row.equipment[input.slot] = input.itemId;
        } else delete row.equipment[input.slot];
      }
      await tx.query(
        "UPDATE player_avatars SET display_name=$2,body_color=$3,equipment=$4,appearance=$5,updated_at=now() WHERE user_id=$1",
        [
          userId,
          row.display_name,
          row.body_color,
          row.equipment,
          row.appearance,
        ],
      );
      return row;
    });
  }
  async placeFurniture(userId, { mochiId, slot, snap }) {
    if (
      !["bed", "plant", "rug", "computer", "toy"].includes(slot) ||
      !Number.isInteger(snap) ||
      snap < 0 ||
      snap > 5
    )
      throw new GameError("Choose a home snap point");
    return this.world.transaction([userId], async (tx) => {
      const pet = await this.world.owner(tx, userId, mochiId);
      if (!pet.profile.homeSlots?.[slot])
        throw new GameError("Equip owned furniture before placing it");
      const positions = pet.profile.homePositions ?? {};
      if (
        Object.entries(positions).some(
          ([key, value]) =>
            key !== slot && pet.profile.homeSlots[key] && value === snap,
        )
      )
        throw new GameError("That snap point is occupied");
      positions[slot] = snap;
      pet.profile.homePositions = positions;
      await tx.query("UPDATE mochis SET profile=$2 WHERE id=$1", [
        mochiId,
        pet.profile,
      ]);
      return { message: "Furniture position saved" };
    });
  }
  async companion(userId) {
    const u = await this.world.account(userId);
    const id = u.profile.activeMochi;
    if (!id) return null;
    const row = (
      await this.pool.query(
        "SELECT m.id,m.name,m.profile,coalesce(e.slots,'{}'::jsonb) AS equipment FROM mochis m LEFT JOIN equipped_items e ON e.mochi_id=m.id WHERE m.id=$1 AND m.user_id=$2",
        [id, userId],
      )
    ).rows[0];
    return row ?? null;
  }
  async select(userId, id) {
    return this.world.transaction([userId], async (tx) => {
      await this.world.owner(tx, userId, id);
      await tx.query(
        "UPDATE users SET profile=jsonb_set(profile,'{activeMochi}',to_jsonb($2::text)) WHERE id=$1",
        [userId, id],
      );
      return { message: "Your active companion changed" };
    });
  }
}
