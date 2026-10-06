// The native brain: mochi.host as a child process, JSON lines both ways.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export class BrainProcess {
  constructor({
    python = join(ROOT, ".venv/bin/python"),
    module = "mochi.host",
    timeoutMs = 0,
  } = {}) {
    this.child = spawn(python, ["-m", module], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.timeoutMs = timeoutMs;
    this.waiting = [];
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const next = this.waiting.shift();
      if (!next) return;
      clearTimeout(next.timer);
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        next.reject(error);
        return;
      }
      if (message.error) next.reject(new Error(message.error));
      else next.resolve(message);
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.on("exit", (code) => {
      for (const next of this.waiting) {
        clearTimeout(next.timer);
        next.reject(new Error(`the brain process ended (${code})`));
      }
      this.waiting = [];
    });
  }
  fail(error) {
    this.failedError = error;
    for (const next of this.waiting) {
      clearTimeout(next.timer);
      next.reject(error);
    }
    this.waiting = [];
  }
  call(message) {
    if (this.failedError || this.child.killed || this.child.exitCode !== null)
      return Promise.reject(
        this.failedError ?? new Error("Brain host is closed"),
      );
    return new Promise((resolve, reject) => {
      const next = { resolve, reject, timer: null };
      this.waiting.push(next);
      if (this.timeoutMs)
        next.timer = setTimeout(() => {
          this.fail(new Error("Brain host response timed out"));
          this.child.kill();
        }, this.timeoutMs);
      this.child.stdin.write(JSON.stringify(message) + "\n", (error) => {
        if (error) this.fail(error);
      });
    });
  }
  close() {
    this.child.stdin.end();
  }
}

export const round = (observation) =>
  Array.from(observation, (value) => Math.round(value * 1e4) / 1e4);

export function args(defaults) {
  const out = { ...defaults };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2),
      value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      out[key] = true;
      continue;
    }
    i += 1;
    out[key] = typeof defaults[key] === "number" ? Number(value) : value;
  }
  return out;
}
