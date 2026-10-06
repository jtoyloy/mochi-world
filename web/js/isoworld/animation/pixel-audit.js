// Offline pixel checks distinguish a tightly trimmed sprite from a clipped export.
export function auditPixels(png, metadata) {
  const warnings = [], used = new Set(metadata.states ? Object.values(metadata.states).flat(2) : metadata.frames.map((_, i) => i));
  for (const i of used) {
    const r = metadata.frames[i].frame;
    let opaque = 0, boundary = 0, cellEdge = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] <= 160) continue;
      opaque++;
      if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) cellEdge++;
      if (x === 0 || y === 0 || x === png.width - 1 || y === png.height - 1) boundary++;
    }
    if (metadata.paddedCells && cellEdge > 2) throw Error(`Clipped padded cell: ${i}`);
    if (opaque < 100) throw Error(`Blank/insufficient opaque frame: ${i}`);
    if (boundary > 2) warnings.push({ frame: i, kind: 'image-edge', pixels: boundary });
    // Pixels continuing beyond a source rectangle indicate a cut silhouette or
    // an adjacent-cell collision. Tight alpha trims alone are not an error.
    let continuation = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (const [x, nx] of [[r.x, r.x - 1], [r.x + r.w - 1, r.x + r.w]]) {
      if (nx >= 0 && nx < png.width && png.data[(y * png.width + x) * 4 + 3] > 160 && png.data[(y * png.width + nx) * 4 + 3] > 160) continuation++;
    }
    for (let x = r.x; x < r.x + r.w; x++) for (const [y, ny] of [[r.y, r.y - 1], [r.y + r.h - 1, r.y + r.h]]) {
      if (ny >= 0 && ny < png.height && png.data[(y * png.width + x) * 4 + 3] > 160 && png.data[(ny * png.width + x) * 4 + 3] > 160) continuation++;
    }
    if (continuation > 2) warnings.push({ frame: i, kind: 'source-edge-continuation', pixels: continuation });
  }
  return warnings;
}
