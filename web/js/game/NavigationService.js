import { walkable, validSegment, roomBounds } from "./model.js";
const grids = new Map();
// Shared deterministic grid routing. Paths are computed again on the server, never trusted.
export class NavigationService {
  constructor(room, step = 20) {
    if (!Number.isFinite(step) || step <= 0)
      throw new RangeError("Navigation step must be positive");
    this.room = room;
    this.step = step;
    this.bounds = roomBounds(room);
  }
  grid() {
    const key = this.room.split(":")[0] + ":" + this.step;
    if (!grids.has(key)) {
      const nodes = [];
      for (let y = this.bounds.minY; y <= this.bounds.maxY; y += this.step)
        for (let x = this.bounds.minX; x <= this.bounds.maxX; x += this.step)
          if (this.isWalkable({ x, y })) nodes.push({ x, y });
      grids.set(key, {
        nodes,
        cells: new Map(nodes.map((p, i) => [`${p.x},${p.y}`, i + 2])),
      });
    }
    return grids.get(key);
  }
  isWalkable(p) {
    return walkable(this.room, p.x, p.y);
  }
  nearestWalkable(p) {
    if (this.isWalkable(p)) return p;
    let best = null,
      distance = Infinity;
    for (const q of this.grid().nodes) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < distance) {
        best = q;
        distance = d;
      }
    }
    return best;
  }
  findPath(start, end) {
    if (start.seated) start = start.seated.approach;
    if (!this.isWalkable(start) || !this.isWalkable(end)) return null;
    const clear = (a, b) => validSegment(this.room, a.x, a.y, b.x, b.y);
    if (clear(start, end)) return [end];
    const grid = this.grid(),
      nodes = [start, end, ...grid.nodes],
      cells = grid.cells;
    const neighbors = (index) => {
      const p = nodes[index],
        ids = [1],
        reach = index < 2 ? 2 : 1;
      const x =
        index < 2
          ? this.bounds.minX +
            Math.round((p.x - this.bounds.minX) / this.step) * this.step
          : p.x;
      const y =
        index < 2
          ? this.bounds.minY +
            Math.round((p.y - this.bounds.minY) / this.step) * this.step
          : p.y;
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const i = cells.get(`${x + dx * this.step},${y + dy * this.step}`);
          if (i !== undefined && i !== index) ids.push(i);
        }
      return ids;
    };
    const open = new Set([0]),
      cost = new Map([[0, 0]]),
      from = new Map();
    while (open.size) {
      let current = -1,
        score = Infinity;
      for (const i of open) {
        const s =
          cost.get(i) + Math.hypot(nodes[i].x - end.x, nodes[i].y - end.y);
        if (s < score) {
          current = i;
          score = s;
        }
      }
      if (current === 1) {
        let ids = [1];
        while (ids[0] !== 0) ids.unshift(from.get(ids[0]));
        const route = ids.map((i) => nodes[i]);
        let smooth = [],
          i = 0;
        while (i < route.length - 1) {
          let j = route.length - 1;
          while (j > i + 1 && !clear(route[i], route[j])) j--;
          smooth.push(route[j]);
          i = j;
        }
        return smooth;
      }
      open.delete(current);
      for (const i of neighbors(current)) {
        const d = Math.hypot(
          nodes[i].x - nodes[current].x,
          nodes[i].y - nodes[current].y,
        );
        if (
          d > (current < 2 || i < 2 ? this.step * 2.1 : this.step * 1.5) ||
          !clear(nodes[current], nodes[i])
        )
          continue;
        const c = cost.get(current) + d;
        if (c < (cost.get(i) ?? Infinity)) {
          cost.set(i, c);
          from.set(i, current);
          open.add(i);
        }
      }
    }
    return null;
  }
}
export const toWorld = (p) => [(p.x - 600) / 50, 0, (p.y - 500) / 50];
export const fromWorld = (p) => ({ x: p.x * 50 + 600, y: p.z * 50 + 500 });
export function smoothAngle(current, target, dt) {
  return (
    current +
    Math.atan2(Math.sin(target - current), Math.cos(target - current)) *
      (1 - Math.exp(-12 * dt))
  );
}
