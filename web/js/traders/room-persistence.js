export function signalSessionExpiry(source) {
  let target = source;
  // The outermost same-origin world owns the login gate; retain nested rooms.
  while (target.parent && target.parent !== target) {
    try {
      if (target.parent.location.origin !== source.location.origin) break;
      target = target.parent;
    } catch { break; }
  }
  target.dispatchEvent(new Event("mochi:session-expired"));
}
export function encodeLife(life) {
  const bytes = new Uint8Array(life.brain);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { ...life, brain: btoa(binary) };
}
export function decodeLife(life) {
  return { ...life, brain: Uint8Array.from(atob(life.brain), x => x.charCodeAt(0)).buffer };
}
export function createRoomPersistence({ mochiId, fetch: request, cacheSave,
  setInterval: startTimer, clearInterval: stopTimer, onLeaseError, onSessionExpired }) {
  const endpoint = "/api/mochis/" + encodeURIComponent(mochiId);
  let lease = null, version = null, owner = null, cached = null, heartbeat = null,
    paused = false, epoch = 0, serial = Promise.resolve();
  const conflict = () => new Error("The cloud brain changed. Your unsaved brain is retained; export it before reloading. Saving would overwrite another session.");
  const validVersion = value => Number.isSafeInteger(value) && value >= 0;
  function stopHeartbeat() {
    if (heartbeat !== null) stopTimer(heartbeat);
    heartbeat = null;
    epoch++;
  }
  function pause(error) {
    paused = true;
    stopHeartbeat();
    onLeaseError(error.message);
  }
  async function api(path, data, method = data === undefined ? "GET" : "POST", reportAuth = true) {
    const response = await request(path, data === undefined ? {} : {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    if (response.status === 401 && reportAuth) onSessionExpired();
    let body;
    try { body = await response.json(); }
    catch {
      const error = new Error("The room returned an invalid response; its unsaved state is retained.");
      error.status = response.status;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(body.error ?? "The room request failed.");
      error.status = response.status;
      throw error;
    }
    return body;
  }
  function startHeartbeat() {
    if (heartbeat !== null || !lease || paused) return;
    const generation = epoch, token = lease.token;
    heartbeat = startTimer(() => {
      const requestedVersion = version;
      return api("/api/brain/heartbeat", { mochiId, token }, "POST", false)
      .then(result => {
        if (generation === epoch && version === requestedVersion && result.version !== version) pause(conflict());
      })
      .catch(error => {
        if (generation === epoch) {
          if (error.status === 401) onSessionExpired();
          pause(error);
        }
      });
    }, 30000);
  }
  async function loadRecord() {
    if (cached) return cached;
    if (!lease) lease = await api("/api/brain/acquire", { mochiId });
    const record = await api(endpoint);
    if (!record.owner || !validVersion(record.version)
      || (owner !== null && (record.owner !== owner || record.version !== version))
      || (version === null && record.version !== lease.version)) {
      const error = conflict(); pause(error); throw error;
    }
    owner = record.owner; version = record.version; cached = record;
    startHeartbeat();
    return record;
  }
  async function recoverLease() {
    if (!paused) {
      if (!lease || version === null || owner === null) throw new Error("Room lease is unavailable; the brain has not loaded.");
      return;
    }
    // Inspect without replacing retained life/version. Server ownership binds
    // this read and all lease operations to the original account's pet.
    const record = await api(endpoint);
    if (record.owner !== owner || record.version !== version) throw conflict();
    let candidate = lease;
    try {
      const renewed = await api("/api/brain/heartbeat", { mochiId, token: candidate?.token });
      if (renewed.version !== version) throw conflict();
    } catch (error) {
      if (error.status !== 409) throw error;
      candidate = await api("/api/brain/acquire", { mochiId });
      if (candidate.version !== version) {
        await api("/api/brain/release", { mochiId, token: candidate.token }).catch(() => {});
        throw conflict();
      }
    }
    lease = candidate; paused = false;
    stopHeartbeat(); startHeartbeat();
  }
  function saveLife(life) {
    const next = serial.then(async () => {
      try {
        await recoverLease();
        const result = await api(endpoint, { state: life.trader, life: encodeLife(life), leaseToken: lease.token, version }, "PUT");
        if (!result.saved || result.version !== version + 1) throw new Error("The server did not confirm this brain save.");
        version = result.version; cached = null;
      } catch (error) { pause(error); throw error; }
      await cacheSave(life);
      return true;
    });
    serial = next.catch(() => {});
    return next;
  }
  async function releaseRoom() {
    await serial;
    stopHeartbeat();
    if (lease) {
      try { await api("/api/brain/release", { mochiId, token: lease.token }); }
      catch (error) { pause(error); throw error; }
      lease = null;
    }
  }
  return { loadRecord, saveLife, releaseRoom, roomToken: () => lease?.token,
    roomReady: () => !!lease && !paused && version !== null && owner !== null && heartbeat !== null };
}
