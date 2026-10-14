import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { GameError } from "./service.mjs";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const sessionToken = (req) => (req.headers.cookie ?? "").split(";")
  .map((value) => value.trim()).find((value) => value.startsWith("mochi_session="))?.slice(14);

export class AccountAuth {
  constructor(service, { development = false, now = () => Date.now() } = {}) {
    Object.assign(this, { service, development, now });
    this.attempts = new Map();
    this.activeHashes = 0;
    this.revocationRevision = 0;
  }
  limit(req, username) {
    const now = this.now();
    for (const [key, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(key);
    const keys = [["ip:" + req.socket.remoteAddress, 60], ["user:" + username, 10]];
    for (const [key, max] of keys) {
      const entry = this.attempts.get(key);
      if (entry?.count >= max || (!entry && this.attempts.size >= 10000))
        throw new GameError("Too many sign-in attempts. Try again in ten minutes.", 429);
    }
    for (const [key] of keys) {
      const entry = this.attempts.get(key) ?? { count: 0, until: now + 600000 };
      entry.count++;
      this.attempts.set(key, entry);
    }
  }
  async key(password, salt) {
    if (this.activeHashes >= 4) throw new GameError("Sign-in is busy. Please try again shortly.", 429);
    this.activeHashes++;
    try { return await derive(password, salt, 64, options); }
    finally { this.activeHashes--; }
  }
  credentials(data) {
    if (!data || typeof data.username !== "string" || !/^[a-z0-9_-]{3,24}$/.test(data.username)
        || typeof data.password !== "string" || data.password.length < 12 || data.password.length > 128)
      throw new GameError("Use a 3–24 character lowercase username and a password of 12–128 characters.", 400);
    return data;
  }
  async register(req, res, data) {
    const { username, password } = this.credentials(data);
    this.limit(req, username);
    const salt = randomBytes(16).toString("hex");
    const hash = (await this.key(password, salt)).toString("hex");
    const user = await this.service.ensureUser(username, username, { passwordHash: `scrypt-v1:${salt}:${hash}` });
    await this.issue(res, user.id);
    return { message: "Welcome to Mochi World.", userId: user.id };
  }
  async login(req, res, data) {
    const { username, password } = this.credentials(data);
    this.limit(req, username);
    const row = (await this.service.pool.query("SELECT id,password_hash FROM users WHERE username=$1", [username])).rows[0];
    const parts = row?.password_hash?.split(":");
    const valid = parts?.length === 3 && parts[0] === "scrypt-v1"
      && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
    // Unknown and pre-authentication accounts still pay the same hash cost.
    const key = await this.key(password, valid ? parts[1] : "00000000000000000000000000000000");
    const expected = valid ? Buffer.from(parts[2], "hex") : Buffer.alloc(64);
    if (!timingSafeEqual(key, expected) || !valid) throw new GameError("Username or password is incorrect.", 401);
    await this.issue(res, row.id);
    return { message: "Welcome back.", userId: row.id };
  }
  cookie(res, value, age) {
    res.setHeader("Set-Cookie", `mochi_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${this.development ? "" : "; Secure"}`);
  }
  async issue(res, userId) {
    const token = randomBytes(32).toString("hex");
    await this.service.pool.query("DELETE FROM game_sessions WHERE user_id=$1 AND expires_at<=now()", [userId]);
    await this.service.pool.query("INSERT INTO game_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [digest(token), userId]);
    this.cookie(res, token, 604800);
    return userId;
  }
  async identify(req) {
    return (await this.session(req))?.userId ?? null;
  }
  async session(req) {
    const token = sessionToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const revision = this.revocationRevision;
    const row = (await this.service.pool.query("SELECT user_id,expires_at FROM game_sessions WHERE id=$1 AND expires_at>now()", [digest(token)])).rows[0];
    // A SELECT begun before revocation can arrive after logout completed.
    if (revision !== this.revocationRevision) return this.session(req);
    return row ? { userId: row.user_id, expiresAt: new Date(row.expires_at).getTime() } : null;
  }
  async logout(req, res) {
    const token = sessionToken(req);
    // Revoke all sessions for this account, including its live room connection.
    const userId = await this.identify(req);
    let revoked = false;
    if (userId) revoked = (await this.service.pool.query("DELETE FROM game_sessions WHERE user_id=$1", [userId])).rowCount > 0;
    else if (token) await this.service.pool.query("DELETE FROM game_sessions WHERE id=$1", [digest(token)]);
    this.cookie(res, "", 0);
    if (revoked) this.revocationRevision++;
    return userId;
  }
}
