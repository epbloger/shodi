// Import structured CC0 facts from Wikidata, not Wikipedia prose or user reviews.
import { currentPlaces } from "../public/data/current-places.js";
import { importedDescriptions as previous } from "../public/data/imported-descriptions.js";
import { descriptionRecords } from "../public/data/place-descriptions.js";
import { writeFile, mkdir } from "node:fs/promises";
const names = new Map();
const norm = s => s.normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").trim().replace(/\s+/g," ");
const records = Object.values(currentPlaces).flat().filter(r => r[6] !== "closed" && Number.isFinite(r[4]) && Number.isFinite(r[5]));
for (const [,name,, ,lat,lon] of records) {
  if (typeof name !== "string" || name.length < 3 || name.length > 180) continue;
  const k=norm(name); if(!names.has(k)) names.set(k,[]);
  names.get(k).push({name,lat,lon});
}
const labels = [...new Set([...names.values()].flatMap(rows=>rows.map(x=>x.name)))].sort();
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
let processed=0,failed=0,consecutive=0;
for(let i=0; i<labels.length && i/batchSize<max; i+=batchSize){
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
    processed+=batch.length;consecutive=0;
  } catch(e){
    failed+=batch.length;consecutive++;console.warn("Batch",i/batchSize+1,String(e));
    if(consecutive>=3){console.warn("Stopping after three consecutive source failures; retaining previous data.");break;}
  }
  if(i/batchSize%20===0)console.log("Queried labels",processed,"of",labels.length,"matched records",matches.size);
  await pause(1000);
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
const report={catalogPlaces:records.length,uniqueLabels:labels.length,queriedLabels:processed,failedLabels:failed,unqueriedLabels:Math.max(0,labels.length-processed-failed),coveredPlaces:covered,importedRecords:rows.length,license:"CC0",source:"https://www.wikidata.org/",generatedAt:new Date().toISOString()};
await mkdir("docs",{recursive:true});
await writeFile("docs/description-coverage.json",JSON.stringify(report,null,2)+"\n");
if(processed>0)await writeFile("public/data/imported-descriptions.js","// Generated from Wikidata CC0; matched by label and coordinates.\nexport const importedDescriptions = "+JSON.stringify(rows)+";\n");
console.log(JSON.stringify(report));
if(processed===0)process.exitCode=1;
