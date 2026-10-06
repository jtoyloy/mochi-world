import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPixels } from '../../web/js/isoworld/animation/pixel-audit.js';
test('pixel audit rejects blank frames and distinguishes trim from clipping', () => {
  const png = { width: 20, height: 20, data: new Uint8Array(1600) };
  const m = { frames: [{ frame: { x: 2, y: 2, w: 12, h: 12 } }] };
  assert.throws(() => auditPixels(png, m), /Blank/);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) png.data[(y * 20 + x) * 4 + 3] = 255;
  assert.deepEqual(auditPixels(png, m), []);
  assert.throws(() => auditPixels(png, {...m,paddedCells:true}), /Clipped padded cell/);
  for (let y = 2; y < 14; y++) png.data[(y * 20 + 14) * 4 + 3] = 255;
  assert.equal(auditPixels(png, m)[0].kind, 'source-edge-continuation');
  m.frames[0].frame = { x: 0, y: 0, w: 20, h: 20 };
  for (let y = 2; y < 14; y++) png.data[(y * 20) * 4 + 3] = 255;
  assert.equal(auditPixels(png, m)[0].kind, 'image-edge');
});
