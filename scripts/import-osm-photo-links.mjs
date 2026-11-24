import {writeFile,mkdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {currentPlaces} from "../public/data/current-places.js";
import {osmPhotoLinks as previous} from "../public/data/osm-photo-links.js";
import {normalizedName,linkFromOsm,matchingLinks} from "../public/osm-photo-links.js";
const endpoint="https://maps.mail.ru/osm/tools/overpass/api/interpreter";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const catalog=Object.values(currentPlaces).flat().filter(r=>["open","unknown",undefined].includes(r[6])&&Number.isFinite(r[4])&&Number.isFinite(r[5])).map(([id,name,,,lat,lon])=>({id,name,lat,lon}));
const cells=new Map();
for(const p of catalog){
  const key=Math.floor(p.lat*2)+","+Math.floor(p.lon*2);
  if(!cells.has(key))cells.set(key,[]);
  cells.get(key).push(p);
}
const groups=[...cells.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
const out=Object.fromEntries(catalog.filter(p=>Object.hasOwn(previous,p.id)).map(p=>[p.id,previous[p.id]]));
const gridHash=createHash("sha256").update(JSON.stringify(groups.map(([key,places])=>[key,places.map(p=>[p.id,p.name,p.lat,p.lon])]))).digest("hex");
let completed=new Set();
try{
 const old=JSON.parse(await readFile("docs/osm-photo-coverage.json","utf8"));
 if(old.gridHash===gridHash&&Array.isArray(old.completedCells))completed=new Set(old.completedCells.filter(k=>cells.has(k)));
}catch{}
const deadline=Date.now()+70*60000;
let scanned=0,errors=0,consecutive=0,examined=0;
for(const [key,places] of groups){
  if(completed.has(key))continue;
  if(Date.now()>deadline)break;
  const [y,x]=key.split(",").map(Number);
  const bbox=[y/2-.005,x/2-.02,(y+1)/2+.005,(x+1)/2+.02].join(",");
  const query='[out:json][timeout:45];(nwr["name"]["wikimedia_commons"]('+bbox+');nwr["name"]["image"~"commons.wikimedia.org/wiki/File:|^File:"]('+bbox+');nwr["name"]["wikidata"]('+bbox+'););out center;';
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{"User-Agent":"SHODI/2.0 catalog (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(65000),redirect:"error"});
    if(!response.ok){if(response.status===429||response.status===503){const h=Number(response.headers.get("Retry-After"));await pause(Math.min(180,Math.max(60,Number.isFinite(h)?h:60))*1000);}throw Error("HTTP "+response.status);}
    const data=await response.json();
    if(data.remark||!Array.isArray(data.elements))throw Error("Incomplete Overpass response");
    const index=new Map();
    for(const element of data.elements){
      const row=linkFromOsm(element);if(!row)continue;
      for(const name of new Set(row.names.map(normalizedName))){
        if(!index.has(name))index.set(name,[]);
        index.get(name).push(row);
      }
    }
    for(const place of places){
      const match=matchingLinks(place,index.get(normalizedName(place.name))||[]);
      if(match)out[place.id]=match;else delete out[place.id];
    }
    scanned++;completed.add(key);examined+=places.length;consecutive=0;
  }catch(e){errors++;consecutive++;console.warn("Cell",key,String(e));if(consecutive>=5)break;}
  if(scanned%20===0)console.log({scanned,total:groups.length,matched:Object.keys(out).length,errors});
  await pause(3500);
}
const report={catalogPlaces:catalog.length,matchedPlaces:Object.keys(out).length,directFileLinks:Object.values(out).filter(p=>p.files.length).length,wikidataLinks:Object.values(out).filter(p=>p.qid).length,examinedPlaces:examined,scannedCells:completed.size,newlyScannedCells:scanned,totalCells:groups.length,gridHash,completedCells:[...completed].sort(),errors,license:"ODbL-1.0",source:"https://www.openstreetmap.org/copyright",endpoint,generatedAt:new Date().toISOString()};
await mkdir("docs",{recursive:true});
await writeFile("docs/osm-photo-coverage.json",JSON.stringify(report,null,2)+"\n");
if((!scanned&&completed.size!==groups.length)||!Object.keys(out).length)throw Error("No verified OSM photo links imported");
await writeFile("public/data/osm-photo-links.js","// OpenStreetMap contributors, ODbL 1.0. Separate photo-link database; see docs/photo-providers.md.\nexport const osmPhotoLinks = "+JSON.stringify(out)+";\n");
console.log(JSON.stringify(report));
