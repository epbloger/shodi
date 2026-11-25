// One verified article per chain; no speculative cross-brand matching.
import {readFile,writeFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
import {brandForPlace} from "../public/brands.js";
import {editorialGuide} from "../public/editorial-guide.js";
import {wikiSummaryForPlace,wikipediaTextLicense} from "../public/wiki-summary.js";
import {candidateBrandTitles,matchesBrandArticle} from "../public/brand-articles.js";
import {brandArticles as previous} from "../public/data/brand-articles.js";
const groups=new Map(),out={};
for(const [id,name,kind,,,,status] of Object.values(currentPlaces).flat()){
 if(status&&!["open","unknown"].includes(status))continue;
 const brand=brandForPlace(id,name,kind);
 if(!brand)continue;
 const g=groups.get(brand.key)||{brand,kinds:new Set(),branches:0,covered:0};
 g.kinds.add(kind);g.branches++;
 if(editorialGuide({name,kind,brand})||wikiSummaryForPlace(id,null,brand)?.kind==="wikipedia-brand")g.covered++;
 groups.set(brand.key,g);
}
let checked=new Set();
try{const r=JSON.parse(await readFile("docs/brand-article-coverage.json","utf8"));checked=new Set(Array.isArray(r.checked)?r.checked:[]);}catch{}
for(const [key,row] of Object.entries(previous)){
 const g=groups.get(key);
 if(g&&matchesBrandArticle(row,g.brand,[...g.kinds]))out[key]=row;
}
const deadline=Date.now()+4*60000;
let errors=0,added=0,sourceReady=true;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(params){
 if(Date.now()>=deadline||!sourceReady)throw Error("Article budget exhausted");
 await pause(1100);
 const r=await fetch("https://ru.wikipedia.org/w/api.php",{method:"POST",body:new URLSearchParams({...params,format:"json",formatversion:"2",maxlag:"5"}),headers:{"User-Agent":"SHODI/2.0 guide (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"},redirect:"error",signal:AbortSignal.timeout(18000)});
 if([429,503].includes(r.status))sourceReady=false;
 if(!r.ok)throw Error("HTTP "+r.status);
 const d=await r.json();
 if(d.error){if(d.error.code==="maxlag")sourceReady=false;throw Error(d.error.code);}
 return d;
}
let licensed=false;
try{const d=await api({action:"query",meta:"siteinfo",siprop:"rightsinfo"});licensed=wikipediaTextLicense(d.query?.rightsinfo?.url);}catch(e){errors++;console.warn(String(e));}
const pending=[...groups.values()].filter(g=>g.branches>=2&&g.covered<g.branches&&!out[g.brand.key]&&!checked.has(g.brand.key)&&candidateBrandTitles(g.brand).length).sort((a,b)=>(b.branches-b.covered)-(a.branches-a.covered)||a.brand.key.localeCompare(b.brand.key));
function extract(page){
 if(!page||page.missing||Object.hasOwn(page.pageprops||{},"disambiguation"))return null;
 const raw=String(page.extract||"").trim().replace(/\s+/g," ").replace(/\[\d+\]/g,"").trim();
 const text=raw.length>350?raw.slice(0,349).replace(/\s+\S*$/,"").trimEnd()+"…":raw;
 return {text,title:page.title,revision:page.lastrevid,qid:page.pageprops?.wikibase_item,license:"CC BY-SA 4.0"};
}
for(let i=0;licensed&&sourceReady&&errors<3&&i<pending.length&&Date.now()<deadline;i+=5){
 const batch=pending.slice(i,i+5);
 const titles=[...new Set(batch.flatMap(g=>candidateBrandTitles(g.brand)))];
 try{
  const d=await api({action:"query",titles:titles.join("|"),prop:"extracts|pageprops|info",exintro:"1",explaintext:"1",exchars:"500",exlimit:"20",ppprop:"wikibase_item|disambiguation"});
  // Do not checkpoint an incomplete MediaWiki response.
  if(d.continue||!Array.isArray(d.query?.pages))throw Error("Incomplete article batch");
  const rows=d.query.pages.map(extract).filter(Boolean);
  for(const g of batch){
   const found=new Map(rows.filter(row=>matchesBrandArticle(row,g.brand,[...g.kinds])).map(row=>[row.qid,row]));
   if(found.size===1){out[g.brand.key]=[...found.values()][0];added++;}
   checked.add(g.brand.key);
  }
 }catch(e){errors++;console.warn("Brand article batch:",String(e));}
}
const report={brands:groups.size,articles:Object.keys(out).length,added,coveredBranches:[...groups].reduce((n,[key,g])=>n+(out[key]?g.branches:0),0),checked:[...checked],errors,licenseConfirmed:licensed,license:"CC BY-SA 4.0"};
await writeFile("public/data/brand-articles.js","// Russian Wikipedia contributors, CC BY-SA 4.0; verified brand articles.\nexport const brandArticles = "+JSON.stringify(out)+";\n");
await writeFile("docs/brand-article-coverage.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,checked:checked.size}));
