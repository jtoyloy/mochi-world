import { ROOMS } from "../../web/js/game/model.js";
import pg from "pg";
import { readFile } from "node:fs/promises";
import {
  ITEMS,
  SHOPS,
  TROPHIES,
  ACHIEVEMENTS,
} from "../../web/js/world/catalog.js";
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for the browser-world economy");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  );
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  await pool.query(
    await readFile(new URL("../social/schema.sql", import.meta.url), "utf8"),
  );
  await pool.query(await readFile(new URL("../adventure/schema.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("../adventure/commerce-schema.sql", import.meta.url), "utf8"));
  for (const room of ROOMS)
    await pool.query(
      "INSERT INTO world_rooms(id,name,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,data=$3",
      [room.id, room.name, room],
    );
  for (const item of ITEMS)
    await pool.query(
      "INSERT INTO items(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2",
      [item.id, item],
    );
  for (const shop of SHOPS)
    await pool.query(
      "INSERT INTO shops(id,slug,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=$3",
      [shop.id, shop.slug, shop],
    );
  for (const trophy of TROPHIES)
    await pool.query(
      "INSERT INTO trophies(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2",
      [trophy.id, trophy],
    );
  for (const definition of ACHIEVEMENTS)
    await pool.query(
      "INSERT INTO achievement_definitions(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2",
      [definition.id, definition],
    );
  console.log(
    "Browser-world schema applied; catalog, shops and awards seeded.",
  );
} finally {
  await pool.end();
}
