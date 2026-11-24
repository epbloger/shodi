// Verify all discovered brands, not just popular chains. Never execute remote SVG.
import {writeFile} from "node:fs/promises";
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
const out={},states={},candidates=new Map(),errors=[];
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
 if(brand.file)candidates.set(brand.key,[brand.file]);
}
const known=[...brands.values()].filter(x=>x.brand.qid&&!out[x.brand.key]);
for(let i=0;i<known.length;i+=40){
 if(!available("www.wikidata.org"))break;
 const batch=known.slice(i,i+40);
 try{
  const data=await entities(batch.map(x=>x.brand.qid));
  for(const {brand} of batch){
   const e=data.entities?.[brand.qid];
   const files=brandMatches(e,brand)?logoFiles(e):[];
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
    const u=new URL(info.thumburl);
    if(u.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith("/wikipedia/commons/"))throw Error("Unexpected thumbnail URL");
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
const pending=[...brands.values()].filter(({brand})=>!brand.qid&&!out[brand.key]);
for(let i=0;i<pending.length;i+=20){
 if(!available("query.wikidata.org")||!available("www.wikidata.org"))break;
 const batch=pending.slice(i,i+20);
 const labels=[...new Set(batch.flatMap(({brand})=>[brand.name,brandNameKey(brand.name)]))].filter(Boolean);
 const values=labels.flatMap(name=>["ru","en"].map(lang=>JSON.stringify(name)+"@"+lang)).join(" ");
 const query="SELECT DISTINCT ?item ?label WHERE { VALUES ?label { "+values+" } { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label } ?item wdt:P154 ?logo . }";
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
    const files=brandMatches(entity,brand)?logoFiles(entity):[];
    if(files.length)candidates.set(brand.key,files);
    else states[brand.key]="no-verified-logo-claim";
   }
  }
 }catch(e){recordError("name-batch",e);for(const {brand} of batch)if(!out[brand.key])states[brand.key]="source-error";}
}
// Prioritize explicitly identified brands before resolving names, so a slow
// name service cannot consume the whole import budget before any image is saved.

await importCandidates();
for(const key of brands.keys())if(!states[key])states[key]="not-verified";
const counts={};for(const v of Object.values(states))counts[v]=(counts[v]||0)+1;
const report={totalBrands:brands.size,brandedPlaces:[...brands.values()].reduce((n,b)=>n+b.branches,0),verifiedLogos:Object.keys(out).length,coveredPlaces:Object.keys(out).reduce((n,key)=>n+brands.get(key).branches,0),statusCounts:counts,errors,brands:[...brands.entries()].map(([key,{brand,branches}])=>({key,name:brand.name,branches,status:states[key],source:out[key]?.source})),generatedAt:new Date().toISOString()};
await writeFile("public/data/brand-logos.js","// Generated verified Commons raster logos; see docs/photo-providers.md.\nexport const brandLogos = "+JSON.stringify(out)+";\n");
await writeFile("docs/brand-logo-coverage.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,brands:undefined,errors:errors.slice(0,8)}));
if(!report.verifiedLogos)throw Error("No verified brand logos; coverage requirement not met");
