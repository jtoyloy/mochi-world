// Initialization and decision readiness differ: a lease-paused initialized
// worker still holds a life that must be saved or explicitly refused.
export function createBrainSaver({ state, snapshot, persist, begin, saved, failed, end }) {
  let pending = null;
  return async function save(announce) {
    if (pending) return pending;
    const current = state();
    if (!current.initialized || (!current.ready && !current.leasePaused)) return false;
    begin();
    pending = (async () => {
      try {
        if (await persist(await snapshot()) !== true)
          throw new Error("The server did not confirm this brain save; keep the room open and retry.");
        saved(announce);
        return true;
      } catch (error) {
        failed(error, announce);
        return false;
      } finally { end(); }
    })();
    try { return await pending; }
    finally { pending = null; }
  };
}

export function createRetainedSnapshot({ initialized, begin, end, waitForDecision, readBrain, readState }) {
  return async function snapshot() {
    if (!initialized()) throw new Error("The brain is not initialized; its room cannot be saved or exported yet.");
    begin();
    try {
      await waitForDecision();
      const brain = await readBrain();
      return { ...readState(), brain };
    } finally { end(); }
  };
}
