import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {currentPlaces,currentCatalog} from "../public/data/current-places.js";
async function manifest(path,name){
 const raw=await readFile(path,"utf8");
 const prefix="export const "+name+" = ";
 const lines=raw.trimEnd().split("\n");
 assert.ok(lines[0].startsWith("//")&&lines.length===2&&lines[1].startsWith(prefix)&&lines[1].endsWith(";"),"Invalid data manifest: "+path);
 const data=JSON.parse(lines[1].slice(prefix.length,-1));
 assert.ok(data&&typeof data==="object"&&!Array.isArray(data));
 return data;
}
const links=await manifest("public/data/place-brands.js","placeBrands");
const report=JSON.parse(await readFile("docs/brand-coverage.json","utf8"));
const ids=new Set(Object.values(currentPlaces).flat().map(r=>r[0]));
assert.equal(report.release,currentCatalog.release);
assert.equal(report.catalogPlaces,ids.size);
assert.equal(report.brandedPlaces,Object.keys(links).length);
assert.ok(Object.keys(links).length>0);
for(const [id,row] of Object.entries(links)){
 assert.ok(ids.has(id)&&row&&typeof row.name==="string"&&row.name.trim()&&row.name.length<=120&&(row.qid===null||/^Q[1-9]\d*$/.test(row.qid)),"Invalid brand link");
}
if(process.argv.includes("--logos")){
 const logos=await manifest("public/data/brand-logos.js","brandLogos");
 const counts=JSON.parse(await readFile("docs/brand-logo-coverage.json","utf8"));
 const {brandForPlace,validBrandLogo}=await import("../public/brands.js");
 const map=new Map();
 for(const [id,name,kind,,,,status] of Object.values(currentPlaces).flat()){
  if(status&&!["open","unknown"].includes(status))continue;
  const brand=brandForPlace(id,name,kind);if(!brand)continue;
  const entry=map.get(brand.key)||{brand,branches:0};
  entry.branches++;map.set(brand.key,entry);
 }
 let covered=0;
 for(const [key,logo] of Object.entries(logos)){
  const row=map.get(key);
  assert.ok(row&&validBrandLogo({...logo,brandName:row.brand.name},row.brand),"Invalid logo: "+key);
  covered+=row.branches;
 }
 assert.ok(Object.keys(logos).length>0);
 assert.equal(counts.totalBrands,map.size);
 assert.equal(counts.brandedPlaces,[...map.values()].reduce((sum,row)=>sum+row.branches,0));
 assert.equal(counts.verifiedLogos,Object.keys(logos).length);
 assert.equal(counts.coveredPlaces,covered);
 assert.ok(Array.isArray(counts.brands)&&counts.brands.length===map.size,"Incomplete per-brand report");
 const reported=new Set(),statusCounts={};
 for(const row of counts.brands){
  const expected=map.get(row.key);
  assert.ok(expected&&!reported.has(row.key),"Unknown or duplicate reported brand: "+row.key);
  reported.add(row.key);
  assert.equal(row.name,expected.brand.name);
  assert.equal(row.branches,expected.branches);
  assert.ok(typeof row.status==="string"&&row.status.length>0);
  const logo=Object.hasOwn(logos,row.key)?logos[row.key]:null;
  assert.equal(["verified","retained"].includes(row.status),Boolean(logo),"Logo status mismatch: "+row.key);
  assert.equal(row.source,logo?.source,"Logo source mismatch: "+row.key);
  statusCounts[row.status]=(statusCounts[row.status]||0)+1;
 }
 assert.deepEqual(counts.statusCounts,statusCounts);
 console.log("Unverified brands:",map.size-Object.keys(logos).length,"; uncovered branded places:",counts.brandedPlaces-covered);
 console.log("Verified logo manifest:",counts.verifiedLogos,"logos,",covered,"places");
}
console.log("Verified brand link manifest:",Object.keys(links).length,"places");
