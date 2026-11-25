// Verify all discovered brands, not just popular chains. Never execute remote SVG.
import {readFile,writeFile} from "node:fs/promises";
import {thumbnailUrl} from "../public/commons-thumbnail.js";
import {brandLabelVariants,exactLogoTitle} from "./catalog-match-helpers.mjs";
import {priorAttempts,unresolvedFirst} from "./brand-import-progress.mjs";
import {currentPlaces} from "../public/data/current-places.js";
import {brandForPlace,brandMatches,brandNameKey,logoFiles,brandLicense,validBrandLogo} from "../public/brands.js";
import {brandLogos as previous} from "../public/data/brand-logos.js";
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ua="SHODI/2.0 brand catalog (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)";
const brands=new Map();
for(const [id,name,kind,,,,status] of Object.values(currentPlaces).flat()){
 if(status&&!["open","unknown"].includes(status))continue;
 const b=brandForPlace(id,name,kind);if(!b)continue;
 if(!brands.has(b.key))brands.set(b.key,{brand:b,branches:0});
 brands.get(b.key).branches++;
}
const scope=JSON.parse(await readFile("docs/release-priority-scope.json","utf8"));
const priority=new Set(scope.brands.map(b=>b.key));
const verifiedOnly=process.argv.includes("--verified-identity-only");
const out={},states={},candidates=new Map(),errors=[];
let previousReport=null;
try{previousReport=JSON.parse(await readFile("docs/brand-logo-coverage.json","utf8"));}
catch(e){if(e.code!=="ENOENT")console.warn("Ignoring unreadable previous coverage report:",String(e));}
const attempts=priorAttempts(previousReport,brands);
const categoryAttempts=new Map((previousReport?.brands||[]).filter(r=>brands.has(r.key)&&Number.isFinite(Date.parse(r.categoryAttemptAt))).map(r=>[r.key,Date.parse(r.categoryAttemptAt)]));
const directAttempts=new Map((Array.isArray(previousReport?.brands)?previousReport.brands:[]).filter(r=>brands.has(r.key)&&Number.isFinite(Date.parse(r.directAttemptAt))).map(r=>[r.key,Date.parse(r.directAttemptAt)]));
const resolvedQids=new Map([...brands.values()].filter(x=>x.brand.qid).map(x=>[x.brand.key,x.brand.qid]));
const categories=new Map();
function rememberCategory(key,entity){
 const cs=[...new Set((entity?.claims?.P373||[]).filter(c=>c.rank!=="deprecated").map(c=>c.mainsnak?.datavalue?.value).filter(s=>typeof s==="string"&&s.length<=180&&!/[<>|#?\u0000-\u001f]/.test(s)))];
 if(cs.length===1)categories.set(key,cs[0]);
}
const attempted=rows=>{const at=Date.now();for(const {brand} of rows)attempts.set(brand.key,at);};
const previousStates=new Map((Array.isArray(previousReport?.brands)?previousReport.brands:[]).filter(row=>row&&typeof row.status==="string"&&!["verified","retained"].includes(row.status)).map(row=>[row.key,row.status]));

const deadline=Date.now()+25*60000;
let last=0;
const blocked=new Map();
const available=host=>Date.now()<deadline&&Date.now()>=(blocked.get(host)||0);
async function get(url,binary=false,init={}){
 const host=new URL(url).hostname;
 if(!available(host))throw Error("Source cooldown or time budget: "+host);
 await pause(Math.max(0,last+1100-Date.now()));last=Date.now();
 const r=await fetch(url,{...init,headers:{"User-Agent":ua,"Api-User-Agent":ua,...init.headers},redirect:"error",signal:AbortSignal.timeout(init.method==="POST"?35000:18000)});
 if(r.status===429||r.status===503){
  const raw=r.headers.get("retry-after");const seconds=raw&&/^\d+$/.test(raw)?Number(raw):raw?Math.max(0,(Date.parse(raw)-Date.now())/1000):60;
  blocked.set(host,Date.now()+Math.max(60000,Number.isFinite(seconds)?seconds*1000:60000));
 }
 if(!r.ok)throw Error("HTTP "+r.status+" "+new URL(url).hostname);
 if(!binary){const data=await r.json();if(data.error)throw Error("API "+data.error.code);return data;}
 const type=r.headers.get("content-type")?.split(";")[0];
 if(!["image/jpeg","image/png"].includes(type))throw Error("Not a raster thumbnail");
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>95000)throw Error("Image too large");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const b=Buffer.concat(chunks);
 if(type==="image/png"?!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(b[0]===255&&b[1]===216&&b[2]===255))throw Error("Invalid raster signature");
 return "data:"+type+";base64,"+b.toString("base64");
}
const api=(host,params)=>get("https://"+host+"/w/api.php?"+new URLSearchParams({...params,format:"json"}));
const entities=ids=>api("www.wikidata.org",{action:"wbgetentities",ids:ids.join("|"),props:"labels|aliases|claims",languages:"ru|en"});
const recordError=(stage,e)=>{if(errors.length<60)errors.push({stage,error:String(e).slice(0,220)});};

for(const {brand} of brands.values()){
 const p=previous[brand.key];
 if(p&&validBrandLogo({...p,brandName:brand.name},brand)){out[brand.key]=p;states[brand.key]="retained";}
 if(brand.file&&!verifiedOnly)candidates.set(brand.key,[brand.file]);
}
// Manually disambiguated identity: operating Russian Cinnabon network,
// https://cinnabonrussia.com/; exact current P154 is verified on every import.
for(const [key,qid,file] of [["name:cinnabon","Q1092539","Cinnabon logo.svg"]]){
 const brand=brands.get(key)?.brand;
 if(!brand||out[key])continue;
 const e=(await entities([qid])).entities?.[qid];
 if(!brandMatches(e,brand)||!logoFiles(e).includes(file))throw Error("Verified brand identity changed: "+key);
 candidates.set(key,[file]);
}
const known=verifiedOnly?[]:unresolvedFirst([...brands.values()].filter(x=>priority.has(x.brand.key)&&x.brand.qid&&!out[x.brand.key]&&!attempts.has(x.brand.key)),attempts);
for(let i=0;i<known.length;i+=40){
 if(!available("www.wikidata.org"))break;
 const batch=known.slice(i,i+40);
 attempted(batch);
 try{
  const data=await entities(batch.map(x=>x.brand.qid));
  for(const {brand} of batch){
   const e=data.entities?.[brand.qid];
   const exact=brandMatches(e,brand);
   if(exact)rememberCategory(brand.key,e);
   const files=exact?logoFiles(e):[];
   candidates.set(brand.key,[...new Set([...(candidates.get(brand.key)||[]),...files])]);
   if(!files.length&&!brand.file&&!out[brand.key])states[brand.key]="no-logo-claim";
  }
 }catch(e){recordError("known-brand",e);for(const {brand} of batch)if(!out[brand.key])states[brand.key]="source-error";}
}
// Resolve licensed metadata and thumbnails; already verified entries are never downloaded again.
async function importCandidates(){
const byFile=new Map();
for(const [key,files] of candidates){
 if(out[key])continue;
 for(const file of files.slice(0,3)){
  if(!byFile.has(file))byFile.set(file,[]);
  byFile.get(file).push(key);
 }
}
const files=[...byFile.keys()];
const normalizeFile=s=>{const n=s.replace(/^File:/i,"").replaceAll("_"," ").trim().normalize("NFC");return n.charAt(0).toUpperCase()+n.slice(1);};
const fileIndex=new Map();
for(const file of files){const n=normalizeFile(file);if(!fileIndex.has(n))fileIndex.set(n,[]);fileIndex.get(n).push(...byFile.get(file));}
for(let i=0;i<files.length;i+=20){
 if(!available("commons.wikimedia.org"))break;
 try{
  const data=await api("commons.wikimedia.org",{action:"query",titles:files.slice(i,i+20).map(s=>"File:"+s).join("|"),prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"330",formatversion:"2"});
  for(const page of data.query?.pages||[]){
   if(typeof page.title!=="string")continue;
   const keys=[...new Set(fileIndex.get(normalizeFile(page.title))||[])].filter(key=>!out[key]);if(!keys.length)continue;
   const info=page.imageinfo?.[0],license=brandLicense(info?.extmetadata);
   const author=String(info?.extmetadata?.Artist?.value||(license?.name==="Public domain"?"Автор не указан":"")).replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
   if(!license||!author||author.length>500){for(const key of keys)states[key]="license-or-attribution";continue;}
   try{
    const safeUrl=thumbnailUrl(info.thumburl);
    if(!safeUrl){
     const raw=typeof info.thumburl==="string"?info.thumburl:"";
     let detail="missing or invalid URL";
     try{const rejected=new URL(raw);detail=rejected.hostname+" "+rejected.pathname.slice(0,120)+" parameters:"+[...rejected.searchParams.keys()].join(",").slice(0,100);}catch{}
     throw Error("Unexpected thumbnail URL: "+detail);
    }
    const u=new URL(safeUrl);
    if(!available(u.hostname)){for(const key of keys)states[key]="source-cooldown";continue;}
    const image=await get(u.href,true);
    for(const key of keys){
     const brand=brands.get(key).brand;
     const logo={data:image,brandLogo:true,brandKey:key,brandName:brand.name,author,title:page.title,license:license.name,licenseUrl:license.url,source:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title.replaceAll(" ","_")).replace(/^File%3A/,"File:")};
     if(validBrandLogo(logo,brand)){out[key]=logo;states[key]="verified";}
    }
   }catch(e){recordError("thumbnail",e);for(const key of keys)states[key]="thumbnail-error";}
   if(!available("commons.wikimedia.org"))break;
  }
 }catch(e){recordError("commons",e);}
}
}

await importCandidates();
// Batch exact labels and aliases via the public Wikidata query service.
// This replaces hundreds of one-by-one search requests, while keeping ambiguity checks.
const pending=verifiedOnly?[]:unresolvedFirst([...brands.values()].filter(({brand})=>priority.has(brand.key)&&!brand.qid&&!out[brand.key]&&!attempts.has(brand.key)),attempts);
for(let i=0;i<pending.length;i+=20){
 if(!available("query.wikidata.org")||!available("www.wikidata.org"))break;
 const batch=pending.slice(i,i+20);
 attempted(batch);
 const labels=[...new Set(batch.flatMap(({brand})=>[...brandLabelVariants(brand.name),...brandLabelVariants(brandNameKey(brand.name))]))].filter(Boolean);
 const values=labels.flatMap(name=>["ru","en"].map(lang=>JSON.stringify(name)+"@"+lang)).join(" ");
 const query="SELECT DISTINCT ?item ?label WHERE { VALUES ?label { "+values+" } { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label } }";
 try{
  const result=await get("https://query.wikidata.org/sparql",false,{method:"POST",body:new URLSearchParams({query,format:"json"}),headers:{Accept:"application/sparql-results+json"}});
  if(!Array.isArray(result.results?.bindings))throw Error("Unexpected SPARQL response");
  const matches=new Map();
  for(const row of result.results.bindings){
   const q=/\/(Q[1-9]\d*)$/.exec(row.item?.value||"")?.[1];
   const key=brandNameKey(row.label?.value);
   if(!q||!key)continue;
   if(!matches.has(key))matches.set(key,new Set());
   matches.get(key).add(q);
  }
  const selected=batch.flatMap(({brand})=>{
    const ids=matches.get(brandNameKey(brand.name))||new Set();
    if(ids.size!==1){states[brand.key]=ids.size?"ambiguous-brand":"no-logo-claim";return [];}
    return [{brand,id:[...ids][0]}];
  });
  const ids=[...new Set(selected.map(x=>x.id))];
  for(let j=0;j<ids.length;j+=40){
   const subset=ids.slice(j,j+40);
   const data=await entities(subset);
   for(const {brand,id} of selected.filter(x=>subset.includes(x.id))){
    const entity=data.entities?.[id];
    const exact=brandMatches(entity,brand);
    if(exact){resolvedQids.set(brand.key,id);rememberCategory(brand.key,entity);}
    const files=exact?logoFiles(entity):[];
    if(files.length)candidates.set(brand.key,files);
    else states[brand.key]="no-verified-logo-claim";
   }
  }
 }catch(e){recordError("name-batch",e);for(const {brand} of batch)if(!out[brand.key])states[brand.key]="source-error";}
}
// Prioritize explicitly identified brands before resolving names, so a slow
// name service cannot consume the whole import budget before any image is saved.

await importCandidates();
// Independent structured Commons search for brands without a usable P154.
// Require both a verified entity link and a standalone exact-name logo file.
candidates.clear();
let directChecked=0,directCandidates=0;
const direct=verifiedOnly?[]:unresolvedFirst([...brands.values()].filter(x=>priority.has(x.brand.key)&&resolvedQids.has(x.brand.key)&&!out[x.brand.key]),directAttempts);
for(const {brand} of direct.slice(0,120)){
 if(!available("commons.wikimedia.org"))break;
 if(Date.now()-(directAttempts.get(brand.key)||0)<7*86400000)continue;
 const qid=resolvedQids.get(brand.key);
 try{
  const results=[];
  for(const term of ["logo","логотип"]){
   const data=await api("commons.wikimedia.org",{action:"query",list:"search",srnamespace:"6",srlimit:"30",srsearch:"haswbstatement:P180="+qid+" intitle:"+term,formatversion:"2"});
   if(!Array.isArray(data.query?.search))throw Error("Unexpected Commons structured search response");
   for(const row of data.query.search)if(exactLogoTitle(row.title,brand.name)&&Number.isSafeInteger(row.pageid)&&row.pageid>0)results.push(row);
  }
  directAttempts.set(brand.key,Date.now());
  directChecked++;
  const unique=[...new Map(results.map(row=>[row.pageid,row])).values()];
  // Multiple distinct designs may be historical or ambiguous.
  if(unique.length===1){candidates.set(brand.key,[unique[0].title.slice(5)]);directCandidates++;}
 }catch(e){recordError("commons-structured",e);}
}
await importCandidates();
// Recover P373 categories for verified QIDs even if earlier P154 attempts are on cooldown.
candidates.clear();
const categoryPending=verifiedOnly?[]:[...brands.values()].filter(({brand})=>priority.has(brand.key)&&!out[brand.key]&&resolvedQids.has(brand.key)&&Date.now()-(categoryAttempts.get(brand.key)||0)>=7*86400000);
for(let i=0;i<categoryPending.length;i+=40){
 if(!available("www.wikidata.org"))break;
 const group=categoryPending.slice(i,i+40),ids=[...new Set(group.map(({brand})=>resolvedQids.get(brand.key)))];
 try{const result=await entities(ids);for(const {brand} of group){const e=result.entities?.[resolvedQids.get(brand.key)];if(brandMatches(e,brand))rememberCategory(brand.key,e);}}catch(e){recordError("category-entity",e);break;}
}
let categoryChecked=0;
for(const {brand} of categoryPending.slice(0,120)){
 if(!available("commons.wikimedia.org"))break;
 const cat=categories.get(brand.key);if(!cat)continue;
 try{
  const results=new Map();
  let cmcontinue;
  for(let j=0;j<3;j++){
   const data=await api("commons.wikimedia.org",{action:"query",list:"categorymembers",cmtitle:"Category:"+cat,cmtype:"file",cmlimit:"100",formatversion:"2",...(cmcontinue?{cmcontinue}:{})});
   if(!Array.isArray(data.query?.categorymembers))throw Error("Unexpected category response");
   for(const r of data.query.categorymembers)if(exactLogoTitle(r.title,brand.name)&&Number.isSafeInteger(r.pageid))results.set(r.pageid,r.title.slice(5));
   cmcontinue=data.continue?.cmcontinue;
   if(!cmcontinue)break;
  }
  // An incomplete category or several logo variants is ambiguous.
  if(!cmcontinue){categoryAttempts.set(brand.key,Date.now());categoryChecked++;if(results.size===1)candidates.set(brand.key,[...results.values()]);}
 }catch(e){recordError("commons-category",e);}
}
await importCandidates();

// New method for major chains: exact standalone file plus explicitly identified
// official source domain in Commons credit metadata. Never infer a license.
candidates.clear();
const official={"name:куулклевер":["coolclever.ru","КуулКлевер","CoolClever"],"name:андерсон":["cafeanderson.com","АндерСон","Anderson"],"name:британские пекарни british bakery":["british-bakery.ru","Британские пекарни","British Bakery"],"name:пхалихинкали":["phali-hinkali.ru","ПхалиХинкали","Пхали Хинкали"],"name:брусника кондитерская кулинария":["brusnikacafe.ru","Брусника"],"name:блинбери":["blinberry.group","БлинБери","Blinberry"],"name:кофе бон":["coffeebon.ru","Кофе Бон","Coffee Bon"],"name:zамания":["zamania.ru","Zамания","Zamania","Замания"],"name:волконский":["wolkonsky.com","Волконский","Wolkonsky"],"name:питькофе, сеть кофеен":["pitcofe.ru","ПитьКофе"],"name:вареничная no1":["varenichnaya1.ru","Вареничная №1"],"name:хинкали gали":["hinkaligali.ru","Хинкали Gали"],"name:пироговые линдфорс":["lindfors.ru","Линдфорс","Lindfors"],"name:farfor доставка удовольствий":["farfor.ru","FARFOR"],"name:пекарня мамин хлеб ижевск":["maminhleb.ru","Мамин хлеб"],"name:грузинские каникулы":["gruzinskie-kanikuli.ru","Грузинские Каникулы"],"name:дуть особое пространство":["dutclub.com","Дуть"],"name:академия кофе":["akademiacoffee.com","Академия Кофе"],"name:burger heroes":["burgerheroes.ru","Burger Heroes"],"name:lambic":["lambic.ru","Brasserie Lambic","Lambic"],"name:бургер & фрайс":["miratorg.ru","Бургер & Фрайс","Бургер&Фрайс"],"name:the coffee bean & tea leaf (philippines)":["coffeebean.com.ph","The Coffee Bean & Tea Leaf"]};
let officialChecked=0;
function creditMatches(meta,host){
 const credit=[meta?.Credit?.value,meta?.Source?.value,meta?.Attribution?.value].filter(s=>typeof s==="string").join(" ");
 for(const hit of credit.matchAll(/https?:\/\/[^\s"'<>]+/gi)){
  try{const u=new URL(hit[0].replace(/&amp;/g,"&"));if(!u.username&&!u.password&&!u.port&&(u.hostname===host||u.hostname.endsWith("."+host)))return true;}catch{}
 }
 return false;
}
for(const [key,[host,...names]] of verifiedOnly?[]:Object.entries(official)){
 if(!priority.has(key)||out[key]||!brands.has(key)||!available("commons.wikimedia.org"))continue;
 officialChecked++;
 try{
  const exact=new Map();
  for(const name of names.slice(0,2)){
   if(!available("commons.wikimedia.org"))break;
   const d=await api("commons.wikimedia.org",{action:"query",list:"search",srnamespace:"6",srlimit:"30",srsearch:'"'+name.replace(/"/g,"")+'" (logo OR логотип)',formatversion:"2"});
   for(const r of d.query?.search||[])if(names.some(n=>exactLogoTitle(r.title,n))&&Number.isSafeInteger(r.pageid))exact.set(r.pageid,r.title);
  }
  if(!exact.size)continue;
  const d=await api("commons.wikimedia.org",{action:"query",pageids:[...exact.keys()].slice(0,20).join("|"),prop:"imageinfo",iiprop:"extmetadata",formatversion:"2"});
  const proven=(d.query?.pages||[]).filter(p=>exact.has(p.pageid)&&brandLicense(p.imageinfo?.[0]?.extmetadata)&&creditMatches(p.imageinfo[0].extmetadata,host));
  if(proven.length===1)candidates.set(key,[proven[0].title.slice(5)]);
 }catch(e){recordError("official-credit",e);}
}
await importCandidates();

for(const key of brands.keys())if(!states[key])states[key]=previousStates.get(key)||"not-verified";
const counts={};for(const v of Object.values(states))counts[v]=(counts[v]||0)+1;
const report={totalBrands:brands.size,brandedPlaces:[...brands.values()].reduce((n,b)=>n+b.branches,0),verifiedLogos:Object.keys(out).length,coveredPlaces:Object.keys(out).reduce((n,key)=>n+brands.get(key).branches,0),statusCounts:counts,directChecked,directCandidates,categoryChecked,officialChecked,errors,brands:[...brands.entries()].map(([key,{brand,branches}])=>({key,name:brand.name,branches,status:states[key],lastAttemptAt:attempts.has(key)?new Date(attempts.get(key)).toISOString():undefined,directAttemptAt:directAttempts.has(key)?new Date(directAttempts.get(key)).toISOString():undefined,categoryAttemptAt:categoryAttempts.has(key)?new Date(categoryAttempts.get(key)).toISOString():undefined,source:out[key]?.source})),generatedAt:new Date().toISOString()};
await writeFile("public/data/brand-logos.js","// Generated verified Commons raster logos; see docs/photo-providers.md.\nexport const brandLogos = "+JSON.stringify(out)+";\n");
await writeFile("docs/brand-logo-coverage.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,brands:undefined,errors:errors.slice(0,8)}));
if(!report.verifiedLogos)throw Error("No verified brand logos; coverage requirement not met");
