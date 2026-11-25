import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {wikiSummaries as previous} from "../public/data/wiki-summaries.js";
import {validWikiSummary,wikipediaTextLicense} from "../public/wiki-summary.js";
import {priorityIdentity} from "../public/priority-identity.js";
const scope=JSON.parse(await readFile("docs/release-priority-scope.json","utf8"));
const rows=new Map(Object.values(currentPlaces).flat().map(r=>[r[0],r]));
assert.equal(rows.size,scope.catalogPlaces);
const places=new Map(cities.flatMap(city=>catalogPlacesForCity(city.id)).map(p=>[p.id,p]));
const out={...previous},newQids=new Set(),results=[];
const deadline=Date.now()+18*60000,pause=ms=>new Promise(r=>setTimeout(r,ms));
const last=new Map(),blocked=new Set();
async function api(host,params){
 if(Date.now()>=deadline||blocked.has(host))throw Error("Source budget or cooldown: "+host);
 await pause(Math.max(0,(last.get(host)||0)+1100-Date.now()));last.set(host,Date.now());
 const r=await fetch("https://"+host+"/w/api.php",{method:"POST",body:new URLSearchParams({...params,format:"json",formatversion:"2",maxlag:"5"}),headers:{"User-Agent":"SHODI/2.0 catalog (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)","Api-User-Agent":"SHODI/2.0 catalog (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"},redirect:"error",signal:AbortSignal.timeout(18000)});
 if([429,503].includes(r.status))blocked.add(host);
 if(!r.ok)throw Error("HTTP "+r.status);
 const d=await r.json();if(d.error){if(d.error.code==="maxlag")blocked.add(host);throw Error(d.error.code);}return d;
}
function extract(page){
 const raw=String(page.extract||"").replace(/\s+/g," ").replace(/\[\d+\]/g,"").trim();
 const text=raw.length>360?raw.slice(0,359).replace(/\s+\S*$/,"").trimEnd()+"…":raw;
 const row={text,title:page.title,revision:page.lastrevid,qid:page.pageprops?.wikibase_item,license:"CC BY-SA 4.0"};
 return validWikiSummary(row)?row:null;
}
let licensed=false,errors=0;
try{const d=await api("ru.wikipedia.org",{action:"query",meta:"siteinfo",siprop:"rightsinfo"});licensed=wikipediaTextLicense(d.query?.rightsinfo?.url);}catch(e){console.warn(String(e));}
const candidates=scope.cultural.map(x=>{const r=rows.get(x.id),p=places.get(x.id);assert.ok(r&&p&&r[1]===x.name&&r[2]===x.kind&&r[4]===x.lat&&r[5]===x.lon,"Scope identity changed "+x.id);return {...x,city:p.city,qid:p.photoItem,descriptionKind:p.descriptionKind,description:p.description};});
for(const p of candidates){
 if(["wikipedia-place","editorial-place","wikivoyage-place"].includes(p.descriptionKind)&&p.description?.length>=70){results.push({id:p.id,status:"existing-substantive"});continue;}
 if(!licensed||blocked.has("ru.wikipedia.org")||Date.now()>=deadline||errors>=8){results.push({id:p.id,status:"source-unavailable-or-budget"});continue;}
 try{
  const d=await api("ru.wikipedia.org",{action:"query",generator:"geosearch",ggscoord:p.lat+"|"+p.lon,ggsradius:"180",ggslimit:"20",prop:"extracts|coordinates|pageprops|info",exintro:"1",explaintext:"1",exchars:"500",exlimit:"20",ppprop:"wikibase_item|disambiguation",colimit:"max"});
  const pages=(d.query?.pages||[]).filter(x=>extract(x));
  let hits=pages.filter(x=>priorityIdentity(x,p));
  if(!hits.length&&pages.length&&!blocked.has("www.wikidata.org")){
   const ids=[...new Set(pages.map(x=>x.pageprops?.wikibase_item).filter(q=>/^Q[1-9]\d*$/.test(q||"")))];
   if(ids.length){const entities=(await api("www.wikidata.org",{action:"wbgetentities",ids:ids.join("|"),props:"labels|aliases",languages:"ru|en"})).entities||{};
    hits=pages.filter(x=>{const e=entities[x.pageprops.wikibase_item];if(!e||e.id!==x.pageprops.wikibase_item)return false;const aliases=["ru","en"].flatMap(lang=>[e.labels?.[lang]?.value,...(e.aliases?.[lang]||[]).map(a=>a.value)]).filter(Boolean);return priorityIdentity(x,p,aliases);});
   }
  }
  const unique=new Map(hits.map(x=>[x.pageprops.wikibase_item,x]));
  if(unique.size!==1){results.push({id:p.id,status:unique.size?"ambiguous":"no-matched-article"});continue;}
  const row=extract([...unique.values()][0]);
  if(!row){results.push({id:p.id,status:"no-valid-text"});continue;}
  if(!Object.hasOwn(out,p.id)){out[p.id]=row;newQids.add(row.qid);results.push({id:p.id,status:"added",qid:row.qid});}
  else results.push({id:p.id,status:"existing-article"});
 }catch(e){errors++;console.warn("Priority place",p.id,String(e));results.push({id:p.id,status:"source-error"});}
}
await writeFile("public/data/wiki-summaries.js","// Russian Wikipedia excerpts, CC BY-SA 4.0.\nexport const wikiSummaries = "+JSON.stringify(out)+";\n");
const report={scope:scope.cultural.length,results,newQids:[...newQids],added:results.filter(r=>r.status==="added").length,errors,licenseConfirmed:licensed};
await writeFile("docs/priority-wiki-report.json",JSON.stringify(report,null,2)+"\n");
let old={};try{old=JSON.parse(await readFile("docs/wiki-summary-coverage.json","utf8"));}catch{}
await writeFile("docs/wiki-summary-coverage.json",JSON.stringify({...old,articles:Object.keys(out).length,priorityAdded:report.added},null,2)+"\n");
console.log(JSON.stringify({scope:report.scope,added:report.added,errors,statusCounts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
