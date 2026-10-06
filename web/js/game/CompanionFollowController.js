import { companionStep, validSegment, moveToward, walkable } from "./model.js";
import { NavigationService } from "./NavigationService.js";
// Declared gameplay safety controller. This does not claim a learned Cadence action.
export class CompanionFollowController {
  step(p, owner, room, dt, now) {
    const next = companionStep(p, owner, dt, now);
    if (validSegment(room, p.x, p.y, next.x, next.y)) return next;
    const goal = new NavigationService(room).nearestWalkable({
      x: owner.x - 95,
      y: owner.y + 40,
    });
    if (!goal) return { ...p, state: "RETURNING" };
    if (!p.route?.length || now - (p.routeAt ?? 0) > 3000) {
      p.route = new NavigationService(room).findPath(p, goal);
      p.routeAt = now;
    }
    const target = p.route?.[0];
    if (target) {
      const q = moveToward(p, target, 235, dt);
      if (Math.hypot(q.x - target.x, q.y - target.y) < 1) p.route.shift();
      if (walkable(room, q.x, q.y)) return { ...p, ...q, state: "RETURNING" };
    }
    return { ...p, state: "RETURNING" };
  }
}
