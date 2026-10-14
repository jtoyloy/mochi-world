// The retained room belongs to its original account until its ordinary save and
// cleanup succeed. Authentication alone must never transfer that state.
export function accountRecovery({ ownerId, identify, cleanup, enter }) {
  let running = false;
  return async (login) => {
    if (running) throw new Error("Account recovery is already in progress.");
    running = true;
    try {
      const expected = ownerId ?? login?.userId;
      if (!expected || login?.userId !== expected) {
        const error = new Error("Sign in to the original account to save the open room. Its unsaved state is still retained.");
        error.accountMismatch = true;
        throw error;
      }
      // Cookies may have changed in another tab since the login response.
      if (await identify() !== expected) {
        const error = new Error("The signed-in account changed. Sign in to the original account before retrying the save.");
        error.accountMismatch = true;
        throw error;
      }
      await cleanup();
      await enter();
    } finally { running = false; }
  };
}
