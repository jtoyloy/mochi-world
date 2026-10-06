import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function processTree(rootPid) {
  // Cumulative CPU, rather than ps %cpu (which averages over process lifetime).
  const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,time=,rss="]);
  const rows = stdout
    .trim()
    .split("\n")
    .map((line) => {
      const [pid, ppid, time, rss] = line.trim().split(/\s+/);
      const parts = time.split(":").map(Number);
      let seconds = 0;
      for (const part of parts) seconds = seconds * 60 + part;
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        cpuSeconds: seconds,
        rssBytes: Number(rss) * 1024,
      };
    });
  const ids = new Set([rootPid]);
  let size;
  do {
    size = ids.size;
    for (const r of rows) if (ids.has(r.ppid)) ids.add(r.pid);
  } while (size !== ids.size);
  const children = rows.filter((r) => ids.has(r.pid));
  return {
    at: Date.now(),
    cpuSeconds: children.reduce((n, r) => n + r.cpuSeconds, 0),
    rssBytes: children.reduce((n, r) => n + r.rssBytes, 0),
    processes: children.length,
  };
}
