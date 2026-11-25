// Merge verified artifacts from the same exact catalog, without executing downloaded JS.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
import {validWikiSummary} from "../public/wiki-summary.js";
const ids=new Set(Object.values(currentPlaces).flat().map(r=>r[0]));
const parse=async path=>{
 const raw=await readFile(path,"utf8");
 const m=/^\/\/[^\n]*\nexport const wikiSummaries = (\{[\s\S]*\});\n?$/.exec(raw);
 assert.ok(m,"Unexpected wiki manifest");
 const data=JSON.parse(m[1]);
 return Object.entries(data).filter(([key,row])=>validWikiSummary(row)&&(ids.has(key)||key===row.qid||key==="brand:"+row.qid));
};
const target="public/data/wiki-summaries.js",out=new Map(await parse(target));
let restored=0;
for(const dir of process.argv.slice(2)){
 const brand=await readFile(dir+"/public/data/place-brands.js","utf8");
 if(brand!==await readFile("public/data/place-brands.js","utf8")){console.warn("Brand snapshot mismatch",dir);continue;}
 const entries=await parse(dir+"/public/data/wiki-summaries.js");
 const report=JSON.parse(await readFile(dir+"/docs/wiki-summary-coverage.json","utf8"));
 assert.equal(entries.length,report.articles,"Artifact report mismatch");
 for(const [key,row] of entries)if(!out.has(key)){out.set(key,row);restored++;}
}
await writeFile(target,"// Russian Wikipedia excerpts, CC BY-SA 4.0.\nexport const wikiSummaries = "+JSON.stringify(Object.fromEntries(out))+";\n");
console.log(JSON.stringify({restored,merged:out.size}));
