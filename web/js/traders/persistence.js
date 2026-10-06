import {
  saveLife as cacheSave,
  forgetLife as cacheForget,
  lifeToBlob,
  blobToLife,
} from "../storage.js";
export { lifeToBlob, blobToLife };
export const MOCHI_ID =
  new URLSearchParams(location.search).get("mochi") ?? "momo";
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(MOCHI_ID))
  throw new Error("Invalid Mochi ID");
const endpoint = "/api/mochis/" + encodeURIComponent(MOCHI_ID);
let lease = null,
  version = 0,
  cached = null,
  heartbeat = null,
  serial = Promise.resolve();
async function api(path, data) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error);
  return b;
}
export const roomToken = () => lease?.token;
export function encodeLife(life) {
  const bytes = new Uint8Array(life.brain);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { ...life, brain: btoa(binary) };
}
export function decodeLife(life) {
  return {
    ...life,
    brain: Uint8Array.from(atob(life.brain), (x) => x.charCodeAt(0)).buffer,
  };
}
export async function loadRecord() {
  if (cached) return cached;
  if (!lease) lease = await api("/api/brain/acquire", { mochiId: MOCHI_ID });
  const r = await fetch(endpoint);
  if (!r.ok) throw new Error((await r.json()).error);
  cached = await r.json();
  version = cached.version;
  if (!heartbeat)
    heartbeat = setInterval(
      () =>
        api("/api/brain/heartbeat", {
          mochiId: MOCHI_ID,
          token: lease.token,
        }).catch((e) => {
          clearInterval(heartbeat);
          document.dispatchEvent(
            new CustomEvent("lease-error", { detail: e.message }),
          );
        }),
      30000,
    );
  return cached;
}
export async function loadLife() {
  const record = await loadRecord();
  return decodeLife(record.life);
}
export function saveLife(life) {
  const next = serial.then(async () => {
    if (!lease) throw new Error("Room lease is unavailable");
    const r = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: life.trader,
        life: encodeLife(life),
        leaseToken: lease.token,
        version,
      }),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    version = b.version;
    cached = null;
    await cacheSave(life);
  });
  serial = next.catch(() => {});
  return next;
}
export async function releaseRoom() {
  await serial;
  clearInterval(heartbeat);
  if (lease) {
    await api("/api/brain/release", { mochiId: MOCHI_ID, token: lease.token });
    lease = null;
  }
}
export async function forgetLife() {
  await cacheForget();
  await releaseRoom();
  window.parent.location.href = "/home";
}
window.addEventListener("pagehide", () => {
  if (lease)
    navigator.sendBeacon(
      "/api/brain/release",
      new Blob([JSON.stringify({ mochiId: MOCHI_ID, token: lease.token })], {
        type: "application/json",
      }),
    );
});
