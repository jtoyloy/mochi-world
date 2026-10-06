import { createContext } from "react";
export const TownStyleContext = createContext(false);
import * as THREE from "three";
const cache = new Map(),
  mapCache = new Map();
export const MATERIAL_PALETTE = {
  stone: "#e5d4b7",
  paintedWood: "#70958c",
  wood: "#b98e67",
  brass: "#c89b51",
  metal: "#547a77",
  glass: "#92c9c4",
  fabric: "#cb8271",
  foliage: "#82a082",
  water: "#76bcb7",
  plaster: "#f2e3c8",
};
function texture(kind, channel) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d"),
    im = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const seam =
        kind === "stone"
          ? y % 32 < 2 || (x + (Math.floor(y / 32) % 2) * 32) % 64 < 2
          : kind === "fabric"
            ? x % 6 === 0 || y % 6 === 0
            : false;
      const grain =
        kind === "wood" || kind === "paintedWood"
          ? Math.sin(y * 0.8 + Math.sin(x * 0.07) * 2) * 5
          : Math.sin(x * 1.7 + y * 3.3) * 2;
      const v = seam ? -22 : grain,
        idx = (y * 128 + x) * 4;
      const rgb =
        channel === "normal"
          ? [128 + grain * 0.35, 128 + (seam ? 5 : 0), 255]
          : channel === "roughness"
            ? [215 + v, 215 + v, 215 + v]
            : channel === "ao"
              ? [seam ? 217 : 255, seam ? 217 : 255, seam ? 217 : 255]
              : [245 + v, 245 + v, 245 + v];
      im.data.set([...rgb, 255], idx);
    }
  ctx.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(kind === "stone" ? 12 : 2, kind === "stone" ? 8 : 2);
  if (channel === "color") t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function townMaterial(kind = "stone", color = MATERIAL_PALETTE[kind]) {
  const key = kind + color;
  if (cache.has(key)) return cache.get(key);
  const mapped = ["stone", "wood", "paintedWood", "fabric"].includes(kind);
  if (mapped && !mapCache.has(kind))
    mapCache.set(
      kind,
      Object.fromEntries(
        ["color", "normal", "roughness", "ao"].map((c) => [
          c,
          texture(kind, c),
        ]),
      ),
    );
  const maps = mapCache.get(kind) ?? {};
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness:
      kind === "water"
        ? 0.2
        : kind === "glass"
          ? 0.18
          : kind === "brass"
            ? 0.35
            : 0.8,
    metalness: kind === "brass" ? 0.65 : kind === "metal" ? 0.25 : 0,
    map: maps.color,
    normalMap: maps.normal,
    roughnessMap: maps.roughness,
    aoMap: maps.ao,
    normalScale: new THREE.Vector2(0.15, 0.15),
    aoMapIntensity: 0.28,
  });
  if (kind === "glass") {
    m.emissive = new THREE.Color("#edc887");
    m.emissiveIntensity = 0.16;
  }
  cache.set(key, m);
  return m;
}
