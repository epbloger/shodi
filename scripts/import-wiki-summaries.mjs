import {writeFile,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {currentPlaces} from "../public/data/current-places.js";
import {descriptionForPlace} from "../public/descriptions.js";
import {brandForPlace} from "../public/brands.js";
import {osmFactsForPlace,osmFactPhotoLink} from "../public/osm-place-facts.js";
import {osmPhotoLink} from "../public/osm-photo-links.js";
import {validWikiSummary,exactNearbyArticle,wikipediaTextLicense} from "../public/wiki-summary.js";
import {wikiSummaries as previous} from "../public/data/wiki-summaries.js";
const deadline=Date.now()+7*60000,pause=ms=>new Promise(r=>setTimeout(r,ms));
const ua="SHODI/2.0 guide (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)";
const cooldowns=new Map();let errors=0;
const ready=host=>Date.now()>=(cooldowns.get(host)||0);
async function api(host,params){
 if(Date.now()>deadline||!ready(host))throw Error("Source cooldown or budget");
 await pause(1100);
 const r=await fetch("https://"+host+"/w/api.php",{method:"POST",body:new URLSearchParams({...params,format:"json",formatversion:"2",maxlag:"5"}),headers:{"User-Agent":ua,"Api-User-Agent":ua},redirect:"error",signal:AbortSignal.timeout(18000)});
 if([429,503].includes(r.status)){const n=Number(r.headers.get("Retry-After")||60);cooldowns.set(host,Date.now()+Math.max(60000,Number.isFinite(n)?n*1000:60000));}
 if(!r.ok)throw Error("HTTP "+r.status);
 const d=await r.json();if(d.error){if(d.error.code==="maxlag")cooldowns.set(host,Date.now()+60000);throw Error(d.error.code);}return d;
}
const ids=new Map(),places=new Map(),out={};
for(const [id,name,kind,,lat,lon,status] of Object.values(currentPlaces).flat()){
 if(status&&!["open","unknown"].includes(status))continue;
 const details=descriptionForPlace(name,lat,lon)??osmPhotoLink(id)??osmFactPhotoLink(osmFactsForPlace({id,name,kind,lat,lon})),brand=brandForPlace(id,name,kind);
 if(details?.qid)ids.set(details.qid,details.qid);
 if(brand?.qid)ids.set("brand:"+brand.qid,brand.qid);
 places.set(id,{id,name,kind,lat,lon,qid:details?.qid});
}
for(const [id,row] of Object.entries(previous))if(validWikiSummary(row)&&(ids.get(id)===row.qid||places.has(id)&&(!places.get(id).qid||places.get(id).qid===row.qid)))out[id]=row;
const hash=createHash("sha256").update(JSON.stringify([...places.values()])).digest("hex");
let completed=new Set(),checkedIds=new Set();
try{const r=JSON.parse(await readFile("docs/wiki-summary-coverage.json","utf8"));if(r.catalogHash===hash){completed=new Set(r.completedTitles||[]);checkedIds=new Set(r.checkedIds||[]);}}catch{}
let licenseConfirmed=false;
try{
 const rights=await api("ru.wikipedia.org",{action:"query",meta:"siteinfo",siprop:"rightsinfo"});
 const url=rights.query?.rightsinfo?.url;
 licenseConfirmed=wikipediaTextLicense(url);
 if(!licenseConfirmed)console.warn("Wikipedia text license not recognized; preserving previous verified records only:",JSON.stringify(rights.query?.rightsinfo??null));
}catch(e){console.warn("Wikipedia license metadata unavailable:",String(e));}
if(!licenseConfirmed)errors++;

function extract(page,max=360){
 if(!page||Object.hasOwn(page.pageprops||{},"disambiguation"))return null;
 const text=String(page.extract||"").trim().replace(/\s+/g," ").replace(/\[\d+\]/g,"").trim();
 const cut=text.length>max?text.slice(0,max-1).replace(/\s+\S*$/,"").trimEnd()+"…":text;
 const row={text:cut,title:page.title,revision:page.lastrevid,qid:page.pageprops?.wikibase_item,license:"CC BY-SA 4.0"};
 return validWikiSummary(row)?row:null;
}
const queryPages=async titles=>(await api("ru.wikipedia.org",{action:"query",titles:titles.join("|"),prop:"extracts|pageprops|coordinates|info",exintro:"1",explaintext:"1",exchars:"500",exlimit:"20",ppprop:"wikibase_item|disambiguation",colimit:"max"})).query?.pages||[];
const pending=[...new Set([...ids].filter(([k])=>!out[k]&&!checkedIds.has(k)).map(([,q])=>q))];
let added=0,directAdded=0;
for(let i=0;licenseConfirmed&&i<pending.length&&Date.now()<deadline&&ready("www.wikidata.org")&&ready("ru.wikipedia.org");i+=40){
 const batch=pending.slice(i,i+40);
 try{
  const entity=(await api("www.wikidata.org",{action:"wbgetentities",ids:batch.join("|"),props:"sitelinks",sitefilter:"ruwiki"})).entities||{};
  const titles=[...new Set(batch.map(q=>entity[q]?.sitelinks?.ruwiki?.title).filter(Boolean))];
  for(let j=0;j<titles.length;j+=20)for(const p of await queryPages(titles.slice(j,j+20))){
   const q=p.pageprops?.wikibase_item;
   if(!batch.includes(q)||entity[q]?.sitelinks?.ruwiki?.title!==p.title)continue;
   for(const id of [q,"brand:"+q])if(ids.has(id)&&!out[id]){const row=extract(p,id.startsWith("brand:")?350:360);if(row){out[id]=row;added++;}}
  }
  for(const [k,q] of ids)if(batch.includes(q))checkedIds.add(k);
 }catch(e){errors++;console.warn("Wiki entity batch",String(e));if(errors>=4)break;}
}
const priority=new Set(["museum","gallery","theater","architecture","view","walk","park","family","live"]),byTitle=new Map();
for(const p of places.values()){
 if(!priority.has(p.kind)||p.qid||out[p.id]||completed.has(p.name)||!p.name.trim()||p.name.length>80||p.name.includes("|"))continue;
 if(!byTitle.has(p.name))byTitle.set(p.name,[]);
 byTitle.get(p.name).push(p);
}
const titles=[...byTitle.keys()];
for(let i=0;licenseConfirmed&&i<titles.length&&Date.now()<deadline&&ready("ru.wikipedia.org")&&errors<4;i+=20){
 const batch=titles.slice(i,i+20);
 try{
  for(const page of await queryPages(batch)){
   const row=extract(page);if(!row)continue;
   for(const p of batch.flatMap(t=>byTitle.get(t)))if(exactNearbyArticle(page,p)){out[p.id]=row;directAdded++;}
  }
  for(const title of batch)completed.add(title);
 }catch(e){errors++;console.warn("Wiki title batch",String(e));}
}
const report={catalogHash:hash,licenseConfirmed,articles:Object.keys(out).length,added,directAdded,errors,completedTitles:[...completed],checkedIds:[...checkedIds],license:"CC BY-SA 4.0"};
await writeFile("public/data/wiki-summaries.js","// Russian Wikipedia excerpts, CC BY-SA 4.0.\nexport const wikiSummaries = "+JSON.stringify(out)+";\n");
await writeFile("docs/wiki-summary-coverage.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,completedTitles:completed.size,checkedIds:checkedIds.size}));
