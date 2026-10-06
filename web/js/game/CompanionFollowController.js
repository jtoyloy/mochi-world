import { traverse } from "./locomotion/core.js";
import { companionStep, validSegment, moveToward, walkable } from "./model.js";
import { NavigationService } from "./NavigationService.js";
// Declared gameplay safety controller. This does not claim a learned Cadence action.
export class CompanionFollowController {
  step(p, owner, room, dt, now) {
    const next = companionStep(p, owner, dt, now);
    if (validSegment(room, p.x, p.y, next.x, next.y)) return next;
    const goal = new NavigationService(room).nearestWalkable({
      x:
        owner.x -
        Math.sin(owner.rotation ?? 0) * 95 +
        Math.cos(owner.rotation ?? 0) * 40,
      y:
        owner.y -
        Math.cos(owner.rotation ?? 0) * 95 -
        Math.sin(owner.rotation ?? 0) * 40,
    });
    if (!goal) return { ...p, state: "RETURNING" };
    if (!p.route?.length || now - (p.routeAt ?? 0) > 3000) {
      p.route = new NavigationService(room).findPath(p, goal);
      p.routeAt = now;
    }
    const target = p.route?.[0];
    if (target) {
      const q = { x: p.x, y: p.y };
      traverse(
        q,
        p.route,
        Math.min(0.25, dt) * (next.followSpeed ?? 165),
        (a, b) => validSegment(room, a.x, a.y, b.x, b.y),
      );
      if (walkable(room, q.x, q.y))
        return {
          ...next,
          ...q,
          route: p.route,
          routeAt: p.routeAt,
          state: "RETURNING",
        };
    }
    return { ...p, state: "RETURNING" };
  }
}
