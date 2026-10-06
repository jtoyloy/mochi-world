// Recovery is a separate event; it must never erase an unexpected close.
export function recordDisconnect(actor, socket, code, reason, now = Date.now()) {
  actor.disconnects++;
  const planned = socket.plannedClose === true && [1000,1005].includes(code);
  if (!planned) actor.unexpectedDisconnects = (actor.unexpectedDisconnects ?? 0) + 1;
  actor.disconnectEvents ??= [];
  actor.disconnectEvents.push({at: now, user: actor.selfId, code, reason: reason.toString(), planned});
}
