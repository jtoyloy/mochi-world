import { saveLife as cacheSave, forgetLife as cacheForget, lifeToBlob, blobToLife } from "../storage.js";
import { createRoomPersistence, decodeLife, signalSessionExpiry } from "./room-persistence.js";
export { lifeToBlob, blobToLife };
export { encodeLife, decodeLife } from "./room-persistence.js";
export const MOCHI_ID = new URLSearchParams(location.search).get("mochi") ?? "momo";
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(MOCHI_ID)) throw new Error("Invalid Mochi ID");

const persistence = createRoomPersistence({ mochiId: MOCHI_ID,
  fetch: (...args) => fetch(...args), cacheSave,
  setInterval: (...args) => setInterval(...args), clearInterval: id => clearInterval(id),
  onLeaseError: message => document.dispatchEvent(new CustomEvent("lease-error", { detail: message })),
  onSessionExpired: () => signalSessionExpiry(window),
});
export const roomToken = persistence.roomToken;
export const roomReady = persistence.roomReady;
export const loadRecord = persistence.loadRecord;
export const saveLife = persistence.saveLife;
export const releaseRoom = persistence.releaseRoom;
export async function loadLife() { return decodeLife((await loadRecord()).life); }
export async function forgetLife() {
  await cacheForget();
  await releaseRoom();
  window.parent.location.href = "/home";
}
window.addEventListener("pagehide", () => {
  const token = roomToken();
  if (token) navigator.sendBeacon("/api/brain/release",
    new Blob([JSON.stringify({ mochiId: MOCHI_ID, token })], { type: "application/json" }));
});
