import { GameError } from "./service.mjs";

const accountActions = new Set(["/api/auth/register", "/api/auth/login", "/api/auth/logout"]);
const sameOrigin = req => ["http://", "https://"].some(scheme =>
  req.headers.origin === scheme + req.headers.host);
const transportClosed = req => req.aborted || req.socket?.destroyed;

// Reservations include the handler lifetime, so parsed bodies waiting for a
// transaction still occupy their budget. Large saves retain their existing cap.
export class HttpIngress {
  constructor({ maximumReaders = 16, maximumBytes = 64 * 1024 * 1024, maximumRequests = 256, timeoutMs = 30000 } = {}) {
    Object.assign(this, { maximumReaders, maximumBytes, maximumRequests, timeoutMs });
    this.readers = 0;
    this.bytes = 0;
    this.requests = 0;
  }
  async prepare(req, path, authenticate) {
    if (transportClosed(req)) throw new GameError("Request connection closed", 400);
    const api = path.startsWith("/api/");
    const mutation = !["GET", "HEAD"].includes(req.method);
    const account = accountActions.has(path);
    if (mutation && !path.startsWith("/api/"))
      throw new GameError("Method not allowed", 405);
    if (mutation && req.headers.origin && !sameOrigin(req))
      throw new GameError("Cross-origin action refused", 403);
    if (account && (req.method !== "POST" || !sameOrigin(req)))
      throw new GameError(req.method !== "POST" ? "Use POST for account actions." : "Account actions require the same origin.", req.method !== "POST" ? 405 : 403);
    const maximum = req.method === "PUT" && /^\/api\/mochis\/[^/]+$/.test(path)
      ? 30000000 : path.startsWith("/api/auth/") || path.startsWith("/api/adventure/commerce/") ? 4096 : 65536;
    const length = req.headers["content-length"];
    if (mutation && length !== undefined && (!/^\d+$/.test(String(length)) || !Number.isSafeInteger(Number(length))))
      throw new GameError("Invalid Content-Length", 400);
    if (mutation && Number(length ?? 0) > maximum)
      throw new GameError("Request is too large", 413);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (api) this.requests--;
      if (mutation) { this.readers--; this.bytes -= maximum; }
    };
    // GET authentication and handlers also retain application work even when
    // there is no request body. Reserve before starting any authentication.
    if (api && this.requests >= this.maximumRequests)
      throw new GameError("Requests are busy. Please try again shortly.", 503);
    if (mutation) {
      if (this.readers >= this.maximumReaders || this.bytes + maximum > this.maximumBytes)
        throw new GameError("Requests are busy. Please try again shortly.", 503);
      this.readers++;
      this.bytes += maximum;
    }
    if (api) this.requests++;
    try {
      const publicConfig = path === "/api/auth/config" && req.method === "GET";
      const user = path.startsWith("/api/") && !account && !publicConfig ? await authenticate() : null;
      // A consumed IncomingMessage may report destroyed on a healthy socket;
      // only an actual abort/closed transport cancels downstream handler work.
      if (transportClosed(req)) throw new GameError("Request connection closed", 400);
      let body = {};
      if (mutation) {
        const chunks = [];
        let size = 0;
        const timer = setTimeout(() => req.destroy(new GameError("Request body timed out", 408)), this.timeoutMs);
        timer.unref();
        try {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > maximum) throw new GameError("Request is too large", 413);
            chunks.push(chunk);
          }
          if (chunks.length) {
            try { body = JSON.parse(Buffer.concat(chunks).toString()); }
            catch { throw new GameError("Invalid JSON request.", 400); }
          }
        } finally { clearTimeout(timer); }
      }
      return { user, body, release };
    } catch (error) {
      release();
      throw error;
    }
  }
}
