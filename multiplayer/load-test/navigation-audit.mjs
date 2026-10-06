import {writeFile} from 'node:fs/promises';
import {NavigationService} from '../../web/js/game/NavigationService.js';
import {walkable, validSegment, roomBounds, roomSpec} from '../../web/js/game/model.js';
import {TOWN_INTERACTIONS,TOWN_RESIDENTS,residentPosition} from '../../web/js/game/town.js';
const evidence={interactionMismatches:[],movingResidentRequests:[], routeProbes:[], classifications:{C:0,E:0}};
for(const local of TOWN_INTERACTIONS){
 const prop=roomSpec('town').props.find(p=>p[0]===local.id); if(!prop)continue;
 const target={x:prop[2],y:Math.max(370,prop[3]+140)};
 for(let y=target.y-180;y<=target.y+180;y+=20)for(let x=target.x-180;x<=target.x+180;x+=20){
 if(walkable('town',x,y)&&Math.hypot(x-target.x,y-target.y)<=190&&Math.hypot(x-local.x,y-local.y)>120){evidence.interactionMismatches.push({room:'town',id:local.id,origin:{x,y},harnessTarget:target,serverTarget:{x:local.x,y:local.y},harnessRadius:190,serverRadius:120,classification:'C'});break;}
 } }
for(const n of TOWN_RESIDENTS.filter(n=>n.route))for(let now=0;now<40000;now+=1000){const target=residentPosition(n,now),distance=Math.hypot(n.x-target.x,n.y-target.y);if(distance>120){evidence.movingResidentRequests.push({id:n.id,at:now,requestedOrigin:{x:n.x,y:n.y},authoritativeTarget:target,distance,interactionRadius:120,classification:"C"});break;}}
evidence.classifications.C=evidence.interactionMismatches.length+evidence.movingResidentRequests.length;
for(const room of ['town','forest','lake','market','exchange']){
 const nav=new NavigationService(room), bounds=roomBounds(room);let probes=0, invalid=0, roundedBlocked=0, routeInvalid=0; const witnesses=[];
 const points=[];for(let y=bounds.minY;y<=bounds.maxY;y+=120)for(let x=bounds.minX;x<=bounds.maxX;x+=150)if(walkable(room,x,y))points.push({x,y});
 for(let i=0;i<points.length;i++){const start=points[i],end=points[(i*17+13)%points.length]; const path=nav.findPath(start,end);if(!path)continue;let p=start;
 for(const q of path){if(!validSegment(room,p.x,p.y,q.x,q.y))routeInvalid++;for(let n=1;n<30;n++){probes++;const t=n/30,x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t; if(!walkable(room,x,y)){invalid++;if(witnesses.length<10)witnesses.push({start:p,end:q,point:{x,y}});}if(!walkable(room,Math.round(x*100)/100,Math.round(y*100)/100))roundedBlocked++;}p=q;}}
 evidence.routeProbes.push({room,probes,invalid,roundedBlocked,routeInvalid,witnesses});evidence.classifications.E+=invalid;
}
evidence.anchorHypothesis='No shared prop/local IDs: differing radii did not prove historical false rejection. Moving resident authored-position request was a harness bug, reproduced in diagnostic soak.';
await writeFile('docs/assays/navigation-audit.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
