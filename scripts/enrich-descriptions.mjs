// Import structured CC0 facts from Wikidata, not Wikipedia prose or user reviews.
import { currentPlaces } from "../public/data/current-places.js";
import { importedDescriptions as previous } from "../public/data/imported-descriptions.js";
import { descriptionRecords } from "../public/data/place-descriptions.js";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import {osmPhotoLink} from "../public/osm-photo-links.js";
import {linkedDescription} from "./catalog-match-helpers.mjs";
import {createHash} from "node:crypto";
const names = new Map();
const norm = s => s.normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").trim().replace(/\s+/g," ");
const records = Object.values(currentPlaces).flat().filter(r => r[6] !== "closed" && Number.isFinite(r[4]) && Number.isFinite(r[5]));
for (const [,name,, ,lat,lon] of records) {
  if (typeof name !== "string" || name.length < 3 || name.length > 180) continue;
  const k=norm(name); if(!names.has(k)) names.set(k,[]);
  names.get(k).push({name,lat,lon});
}
const labels = [...new Set([...names.values()].flatMap(rows=>rows.map(x=>x.name)))].sort();
const labelHash=createHash("sha256").update(JSON.stringify(labels)).digest("hex");
const distance = (a,b,x,y) => Math.hypot((a-x)*111320,(b-y)*111320*Math.cos(a*Math.PI/180));
const matches = new Map();
const add = row => {
  if(!row || !/^Q[1-9]\d*$/.test(row[4]) || typeof row[3]!=="string" || row[3].length>360 || row[3].trim().length<12) return;
  const candidates=names.get(norm(row[0]))||[];
  if(!candidates.some(p=>distance(p.lat,p.lon,row[1],row[2])<=180))return;
  matches.set(JSON.stringify([norm(row[0]),row[4],row[1],row[2]]),row);
};
previous.forEach(add);
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const batchSize = 100;
const max = Number(process.env.SHODI_DESCRIPTION_BATCHES || Math.ceil(labels.length/batchSize));
let completed=new Set();
try{
 const old=JSON.parse(await readFile("docs/description-coverage.json","utf8"));
 if(old.labelHash===labelHash&&Array.isArray(old.completedBatches))completed=new Set(old.completedBatches.filter(i=>Number.isInteger(i)&&i>=0&&i<Math.ceil(labels.length/batchSize)));
}catch{}
let processed=0,failed=0,consecutive=0,attemptedBatches=0;
for(let i=0; i<labels.length && attemptedBatches<max; i+=batchSize){
  const batchId=i/batchSize;
  if(completed.has(batchId))continue;
  attemptedBatches++;
  const batch=labels.slice(i,i+batchSize);
  const values=batch.flatMap(s=>["ru","en"].map(lang=>JSON.stringify(s)+"@"+lang)).join(" ");
  const query=`SELECT DISTINCT ?item ?label ?coord ?description WHERE {
    VALUES ?label { ${values} }
    { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label }
    ?item wdt:P625 ?coord ; schema:description ?description .
    FILTER(LANG(?description)="ru")
  }`;
  try {
    const body=new URLSearchParams({query,format:"json"});
    const response=await fetch("https://query.wikidata.org/sparql",{
      method:"POST",body,signal:AbortSignal.timeout(40000),
      headers:{"Accept":"application/sparql-results+json","User-Agent":"SHODI-catalog/2.0 (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"}
    });
    if(!response.ok){
      if(response.status===429) {const retry=Number(response.headers.get("retry-after")||60); await pause(Math.min(120,Math.max(30,Number.isFinite(retry)?retry:60))*1000);}
      throw Error("HTTP "+response.status);
    }
    const data=await response.json();
    for(const row of data.results.bindings){
      const p=/^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(row.coord.value);
      const q=/\/((?:Q)[1-9]\d*)$/.exec(row.item.value);
      if(!p||!q)continue;
      const text=row.description.value.trim().replace(/\s+/g," ");
      add([row.label.value,Number(p[2]),Number(p[1]),text,q[1]]);
    }
    processed+=batch.length;completed.add(batchId);consecutive=0;
  } catch(e){
    failed+=batch.length;consecutive++;console.warn("Batch",i/batchSize+1,String(e));
    if(consecutive>=3){console.warn("Stopping after three consecutive source failures; retaining previous data.");break;}
  }
  if(i/batchSize%20===0)console.log("Queried labels",processed,"of",labels.length,"matched records",matches.size);
  await pause(1000);
}
// Independently verified OSM QIDs can recover places missed by exact-label SPARQL.
const linked=new Map();
for(const [id,name,,,lat,lon] of records){
 const qid=osmPhotoLink(id)?.qid;
 if(!qid)continue;
 if(!linked.has(qid))linked.set(qid,[]);
 linked.get(qid).push({name,lat,lon});
}
let linkedChecked=0,linkedAdded=0,linkedErrors=0;
const ids=[...linked.keys()];
for(let i=0;i<ids.length;i+=40){
 const batch=ids.slice(i,i+40);
 try{
  const url="https://www.wikidata.org/w/api.php?"+new URLSearchParams({action:"wbgetentities",ids:batch.join("|"),props:"labels|aliases|descriptions|claims",languages:"ru|en",format:"json"});
  const r=await fetch(url,{headers:{"User-Agent":"SHODI-catalog/2.0 (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"},redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  const data=await r.json();
  if(!data.entities)throw Error("Missing entity response");
  for(const qid of batch){
   linkedChecked++;
   for(const place of linked.get(qid)){
    const row=linkedDescription(data.entities[qid],place,qid);
    if(row){const before=matches.size;add(row);linkedAdded+=matches.size-before;}
   }
  }
 }catch(err){linkedErrors++;console.warn("Linked Wikidata lookup:",String(err));if(linkedErrors>=3)break;}
 await pause(1100);
}
const rows=[...matches.values()].sort((a,b)=>a[0].localeCompare(b[0],"ru")||a[4].localeCompare(b[4])||a[1]-b[1]||a[2]-b[2]);
const lookup=new Map();
for(const row of [...descriptionRecords,...rows]){
  const k=norm(row[0]);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(row);
}
let covered=0;
for(const [,name,,,lat,lon] of records){
  const ids=new Set((lookup.get(norm(name))||[]).filter(r=>distance(lat,lon,r[1],r[2])<=180).map(r=>r[4]));
  if(ids.size===1)covered++;
}
const queriedLabels=[...completed].reduce((sum,i)=>sum+Math.min(batchSize,labels.length-i*batchSize),0);
const report={catalogPlaces:records.length,uniqueLabels:labels.length,queriedLabels,failedLabels:failed,unqueriedLabels:Math.max(0,labels.length-queriedLabels-failed),coveredPlaces:covered,importedRecords:rows.length,labelHash,completedBatches:[...completed].sort((a,b)=>a-b),linkedChecked,linkedAdded,linkedErrors,license:"CC0",source:"https://www.wikidata.org/",generatedAt:new Date().toISOString()};
await mkdir("docs",{recursive:true});
await writeFile("docs/description-coverage.json",JSON.stringify(report,null,2)+"\n");
if(queriedLabels>0||linkedChecked>0)await writeFile("public/data/imported-descriptions.js","// Generated from Wikidata CC0; matched by label and coordinates.\nexport const importedDescriptions = "+JSON.stringify(rows)+";\n");
console.log(JSON.stringify(report));
if(queriedLabels===0&&linkedChecked===0)process.exitCode=1;
