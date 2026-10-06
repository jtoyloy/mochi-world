import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { userInfo } from "node:os";
import pg from "pg";
const exec = promisify(execFile),
  directory = resolve("data/postgres"),
  port = Number(process.env.LOCAL_PG_PORT ?? 55439);
const bin = process.env.PG_BIN ?? "/opt/homebrew/bin";
const tool = (name) => join(bin, name);
await mkdir(resolve("data"), { recursive: true });
try {
  await access(join(directory, "PG_VERSION"));
} catch {
  await exec(tool("initdb"), [
    "-D",
    directory,
    "-A",
    "trust",
    "--encoding=UTF8",
  ]);
}
try {
  await exec(tool("pg_ctl"), ["-D", directory, "status"]);
} catch {
  await exec(tool("pg_ctl"), [
    "-D",
    directory,
    "-l",
    resolve("data/postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k /tmp`,
    "start",
  ]);
}
const url = `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${port}/postgres`,
  pool = new pg.Pool({ connectionString: url });
try {
  if (
    !(
      await pool.query(
        "SELECT 1 FROM pg_database WHERE datname='mochi_world_test'",
      )
    ).rows.length
  )
    await pool.query("CREATE DATABASE mochi_world_test");
} finally {
  await pool.end();
}
console.log(
  "Local PostgreSQL is running with loopback-only trust authentication.",
);
console.log("DATABASE_URL=" + url);
console.log(
  "TEST_DATABASE_URL=" + url.replace("/postgres", "/mochi_world_test"),
);
