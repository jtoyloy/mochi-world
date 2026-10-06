import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { auditPixels } from '../web/js/isoworld/animation/pixel-audit.js';
const root = 'web/assets/isoworld/', report = [];
for (const file of readdirSync(root).filter(f => /-(actions|reactions)-v1\.json$|-(fishing|cleanup|combat)-v2\.json$/.test(f))) {
  const m = JSON.parse(readFileSync(root + file)), p = PNG.sync.read(readFileSync(root + m.image)), warnings = auditPixels(p, m);
  for (const [state, rows] of Object.entries(m.states)) {
    const used = new Set(rows.flat());
    report.push({ atlas: file, image: m.image, state, directions: m.directions, mirrors: m.mirrors,
      distinctSequences: new Set(rows.map(r => r.join(','))).size,
      uniqueFrames: used.size,
      edgeWarnings: warnings.filter(w => used.has(w.frame)),
      logicalCanvas: [...new Set([...used].map(i => JSON.stringify(m.frames[i].sourceSize)))],
      pivot: m.frames[rows[0][0]].pivot,
      footSlide: 'Requires visual planted-contact review; fixed pivot is not proof of planted feet',
      scalePop: 'State uses common scale; silhouette/body ratios require visual review',
      silhouetteCollision: warnings.some(w => used.has(w.frame)) ? 'Source-edge continuation flagged; inspect sheet' : 'No pixel continuation detected',
      weaponClipping: /fish/.test(state) && !m.image.includes('fishing') ? 'Known cross-cell rod in v1; excluded columns do not repair rod' : 'Visual review required',
      contactTiming: 'Presentation sequence only; authoritative hits are independent',
    });
  }
}
writeFileSync('docs/assays/action-art-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(`${report.length} registered states audited`);
