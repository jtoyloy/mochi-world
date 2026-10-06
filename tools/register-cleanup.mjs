// Export reviewed painterly poses into padded logical cells. Fixed scale per
// sheet, authored body pivots: rods/antlers never determine actor scale or feet.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const root = 'web/assets/isoworld/';
function pack(image, output, regions, scale, bodyHeight, mappings, id, mirrors, description, isolate = false) {
  const p = PNG.sync.read(readFileSync(root + image));
  const out = new PNG({ width: 8 * 160, height: Math.ceil(regions.length / 8) * 160 });
  const frames = [];
  for (const [i, [x0,y0,x1,y1,px,py]] of regions.entries()) {
    const ox = (i % 8) * 160, oy = Math.floor(i / 8) * 160;
    let mask;
    if (isolate) {
      mask = new Uint8Array(p.width * p.height);
      let seed, nearest = Infinity;
      for (let sy=y0;sy<y1;sy++) for(let sx=x0;sx<x1;sx++) {
        if(p.data[(sy*p.width+sx)*4+3]<160) continue;
        const distance=(sx-px)**2+(sy-(py-20))**2;
        if(distance<nearest){nearest=distance;seed=sy*p.width+sx;}
      }
      if(seed === undefined) throw Error('Missing coherent pose');
      const core=new Uint8Array(mask.length), queue=[seed];core[seed]=1;
      for(let q=0;q<queue.length;q++) {
        const at=queue[q], sx=at%p.width, sy=Math.floor(at/p.width);
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++) {
          const nx=sx+dx,ny=sy+dy;
          if(nx>=x0&&nx<x1&&ny>=y0&&ny<y1) mask[ny*p.width+nx]=1;
        }
        for(const next of [at-1,at+1,at-p.width,at+p.width]) {
          if(next<0||next>=core.length||core[next]||p.data[next*4+3]<160)continue;
          core[next]=1;queue.push(next);
        }
      }
    }
    for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
      const sx = Math.round(px + (x - 80) / scale), sy = Math.round(py + (y - 149.12) / scale);
      if (sx < x0 || sy < y0 || sx >= x1 || sy >= y1 || (mask && !mask[sy*p.width+sx])) continue;
      const from = (sy * p.width + sx) * 4, to = ((oy+y)*out.width+ox+x)*4;
      out.data.set(p.data.subarray(from,from+4), to);
    }
    frames.push({frame:{x:ox,y:oy,w:160,h:160},sourceSize:{w:224,h:224},spriteSourceSize:{x:32,y:48,w:160,h:160},pivot:{x:.5,y:.88}});
  }
  // Fill export-only spare cells with valid recovery art, never blank slots.
  const lastFrame = frames.at(-1).frame;
  for (let i=regions.length;i<Math.ceil(regions.length/8)*8;i++) {
    const ox=i%8*160, oy=Math.floor(i/8)*160;
    for(let y=0;y<160;y++)for(let x=0;x<160;x++) {
      const from=((lastFrame.y+y)*out.width+lastFrame.x+x)*4;
      out.data.set(out.data.subarray(from,from+4),((oy+y)*out.width+ox+x)*4);
    }
    frames.push({...frames.at(-1),frame:{x:ox,y:oy,w:160,h:160}});
  }
  writeFileSync(root + output, PNG.sync.write(out));
  const m = {format:'mochi-action-atlas/1',image:output,size:[out.width,out.height],frames,states:mappings,requiredStates:Object.keys(mappings),height:bodyHeight,mirrors,directions:description,provenance:'Built-in imagegen identity reference; transparent cutout, fixed-scale atlas export. Authored body ground pivots; source immutable.',sourceImage:image,paddedCells:true,authoredFrameCount:regions.length};
  writeFileSync(root + id + '.json', JSON.stringify(m,null,2)+'\n');
}
// Seven authored fishing stages, expanded to eight playback slots with explicit
// holds. Cast is a wider sprite; each row has its own measured boundaries.
const fishX = [[0,210,395,775,987,1165,1355,1536],[0,215,390,590,956,1158,1342,1536],[0,215,393,775,977,1160,1350,1536],[0,215,393,775,977,1160,1350,1536]];
const centers = [[98,302,495,850,1052,1247,1440],[102,307,493,851,1057,1253,1447],[102,314,493,856,1057,1255,1443],[102,314,493,856,1057,1255,1443]];
const regions=[];
for(let r=0;r<4;r++)for(let c=0;c<7;c++)regions.push([fishX[r][c],r*256,fishX[r][c+1],(r+1)*256,centers[r][c],[262,501,742,977][r]]);
const sequence = cols => Array.from({length:4},(_,r)=>cols.map(c=>r*7+c));
const fishStates = {
 'fish-cast':sequence([0,1,1,2,2,3,3,3]),
 'fish-wait':sequence([3,3,3,3,3,3,3,3]),
 'fish-catch':sequence([4,4,5,5,5,6,6,0]),
};
for (const [style,id] of [['sage','chestnut-sage'],['coral','dark-curls-coral']])
  pack(`fishing-${style}-source-v2.png`,`fishing-${style}-v2.png`,regions,.38,72,fishStates,`${id}-fishing-v2`,[false,false,false,false],'Four separately painted diagonal fishing views SE, SW, NW, NE; eight logical sectors use existing nearest diagonal mapping. Seven authored stages with explicit holds.');

// Review excluded two overlapping original attack drawings. Use complete low
// thrust/contact and recovery poses, never cut an antler to fill a slot.
const deerBounds = [
 [16,66,192,274],[207,95,384,274],[399,121,587,277],[977,131,1164,287],[1163,93,1343,278],[1354,66,1522,274],
 [16,326,190,511],[204,349,385,513],[396,373,588,514],[594,373,782,514],[787,376,970,516],[976,360,1156,515],[1163,335,1335,514],[1345,320,1516,510],
 [16,545,194,755],[207,535,378,758],[391,555,568,758],[579,577,754,758],[782,620,970,767],[975,592,1146,764],[1156,579,1338,764],[1347,560,1514,761],
 [15,805,193,990],[208,820,386,990],[404,809,572,990],[585,856,767,987],[782,866,961,992],[982,876,1163,997],[1170,890,1342,992],[1352,885,1528,990],
];
const deerRegions = deerBounds.map(([x0,y0,x1,y1]) => [Math.max(0,x0-3),Math.max(0,y0-3),Math.min(1536,x1+3),Math.min(1024,y1+3),(x0+x1)/2,y1]);
const deerRows = cols => Array.from({length:4},()=>cols);
pack('deer-cleanup-source-v2.png','deer-cleanup-v2.png',deerRegions,.65,128,{
 attack:deerRows([0,1,2,3,3,4,5,0]),
 special:deerRows([0,1,2,3,3,4,5,0]),
 defend:deerRows([6,7,8,9,10,11,12,13]),
 hurt:deerRows([14,15,16,17,18,19,20,21]),
 defeat:deerRows([22,23,24,25,26,27,28,29]),
 exhausted:deerRows([22,23,24,25,26,27,28,29]),
},'woodland-deer-cleanup-v2',[false,true,true,false],'SE painted; SW/NW mirrored and NE reused. Two overlapping attack drawings excluded; contact held. Dedicated hurt and lying exhaustion, special aliases attack.');

const swordBounds = [
[29,90,180,276],[216,87,351,278],[390,66,540,279],[566,92,750,279],[780,86,989,278],[980,93,1175,278],[1183,88,1323,276],[1370,86,1524,276],
[15,314,174,504],[210,314,353,504],[391,288,537,504],[565,316,750,504],[762,317,956,504],[976,317,1153,503],[1195,315,1328,504],[1357,316,1512,503],
[31,554,189,741],[214,554,390,742],[401,526,550,742],[586,553,762,743],[778,557,1000,744],[1003,552,1154,743],[1183,554,1335,743],[1371,555,1525,742],
[28,779,183,970],[218,779,374,971],[399,749,542,971],[575,781,763,971],[779,784,1007,971],[1001,785,1178,971],[1197,782,1340,971],[1383,784,1522,969],
];
const swordCenters = [[103,286,471,652,854,1053,1253,1450],[103,282,469,663,852,1062,1263,1448],[111,292,474,657,857,1069,1266,1455],[106,294,477,665,858,1071,1269,1459]];
const swordRegions=swordBounds.map(([x0,y0,x1,y1],i)=>[x0-3,y0-3,Math.min(1536,x1+3),y1+3,swordCenters[Math.floor(i/8)][i%8],y1]);
const swordStates={sword:Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>r*8+c))};
pack('sword-sage-source-v2.png','sword-sage-v2.png',swordRegions,.38,72,swordStates,'chestnut-sage-combat-v2',[false,false,false,false],'Four separately painted diagonal sword views. Eight logical sectors retain nearest diagonal mapping. No mirrored directions.',true);

const coralSwordBounds = [
[22,53,185,250],[211,54,358,250],[385,26,548,250],[567,55,756,251],[775,50,989,251],[974,53,1186,250],[1179,51,1332,250],[1367,50,1529,250],
[12,286,178,480],[207,284,353,480],[385,260,540,480],[558,286,753,480],[755,286,958,480],[971,286,1157,480],[1193,286,1333,480],[1357,285,1521,480],
[22,513,196,714],[209,513,399,714],[398,487,554,714],[580,514,772,714],[776,515,1005,714],[1002,513,1160,714],[1183,514,1342,714],[1368,513,1532,714],
[21,744,192,944],[213,743,389,944],[397,715,550,944],[572,746,779,944],[776,747,1011,944],[999,749,1186,944],[1194,745,1345,944],[1379,746,1531,944],
];
const coralSwordRegions=coralSwordBounds.map(([x0,y0,x1,y1],i)=>[x0-3,y0-3,Math.min(1536,x1+3),y1+3,swordCenters[Math.floor(i/8)][i%8],y1]);
pack('sword-coral-source-v2.png','sword-coral-v2.png',coralSwordRegions,.36,72,swordStates,'dark-curls-coral-combat-v2',[false,false,false,false],'Four separately painted diagonal sword views. Eight logical sectors retain nearest diagonal mapping. No mirrored directions.',true);
