// Stationary snapshots can arrive before a newly requested move is accepted.
// An interaction belongs to arrival at its destination, not any stopped tick.
export function interactionArrived(position, destination) {
  return (
    !!destination &&
    !position.moving &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Math.hypot(position.x - destination.x, position.y - destination.y) <= 10
  );
}
