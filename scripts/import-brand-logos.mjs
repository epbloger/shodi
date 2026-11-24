// Verify all discovered brands, not just popular chains. Never execute remote SVG.
import {writeFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
import {brandForPlace,brandMatches,logoFiles,brandLicense,validBrandLogo} from "../public/brands.js";
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
const deadline=Date.now()+20*60000;
let last=0,blockedUntil=0;
async function get(url,binary=false){
 if(Date.now()>deadline||Date.now()<blockedUntil)throw Error("Source cooldown or time budget");
 await pause(Math.max(0,last+1100-Date.now()));last=Date.now();
 const r=await fetch(url,{headers:{"User-Agent":ua,"Api-User-Agent":ua},redirect:"error",signal:AbortSignal.timeout(18000)});
 if(r.status===429||r.status===503){
  const raw=r.headers.get("retry-after");const seconds=raw&&/^\d+$/.test(raw)?Number(raw):raw?Math.max(0,(Date.parse(raw)-Date.now())/1000):60;
  blockedUntil=Date.now()+Math.max(60000,Number.isFinite(seconds)?seconds*1000:60000);
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
const known=[...brands.values()].filter(x=>x.brand.qid);
for(const {brand} of brands.values()){
 const p=previous[brand.key];
 if(p&&validBrandLogo({...p,brandName:brand.name},brand)){out[brand.key]=p;states[brand.key]="retained";}
 if(brand.file)candidates.set(brand.key,[brand.file]);
}
for(let i=0;i<known.length;i+=40){
 if(Date.now()>deadline||Date.now()<blockedUntil)break;
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
// Resolve unlinked brands by exact normalized names; accept only one candidate with P154.
for(const {brand} of brands.values()){
 if(brand.qid||out[brand.key])continue;
 if(Date.now()>deadline||Date.now()<blockedUntil)break;
 try{
  const results=await api("www.wikidata.org",{action:"wbsearchentities",search:brand.name,language:"ru",uselang:"ru",type:"item",limit:"8"});
  const ids=[...new Set((results.search||[]).map(x=>x.id).filter(x=>/^Q[1-9]\d*$/.test(x)))];
  const data=ids.length?await entities(ids):{entities:{}};
  const matches=Object.values(data.entities||{}).filter(e=>brandMatches(e,brand)&&logoFiles(e).length);
  if(matches.length===1)candidates.set(brand.key,logoFiles(matches[0]));
  else states[brand.key]=matches.length?"ambiguous-brand":"no-logo-claim";
 }catch(e){recordError("name-brand",e);states[brand.key]="source-error";}
}
// Query Commons metadata in batches rather than one request per file.
const byFile=new Map();
for(const [key,files] of candidates){
 if(out[key])continue;
 for(const file of files.slice(0,3)){
  if(!byFile.has(file))byFile.set(file,[]);
  byFile.get(file).push(key);
 }
}
const files=[...byFile.keys()];
const normalizeFile=s=>s.replace(/^File:/i,"").replaceAll("_"," ").trim();
const fileIndex=new Map(files.map(file=>[normalizeFile(file),file]));
for(let i=0;i<files.length;i+=20){
 if(Date.now()>deadline||Date.now()<blockedUntil)break;
 try{
  const data=await api("commons.wikimedia.org",{action:"query",titles:files.slice(i,i+20).map(s=>"File:"+s).join("|"),prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"330",formatversion:"2"});
  for(const page of data.query?.pages||[]){
   if(typeof page.title!=="string")continue;
   const file=fileIndex.get(normalizeFile(page.title));
   const keys=(byFile.get(file)||[]).filter(key=>!out[key]);if(!keys.length)continue;
   const info=page.imageinfo?.[0],license=brandLicense(info?.extmetadata);
   const author=String(info?.extmetadata?.Artist?.value||(license?.name==="Public domain"?"Автор не указан":"")).replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
   if(!license||!author||author.length>500){for(const key of keys)states[key]="license-or-attribution";continue;}
   try{
    const u=new URL(info.thumburl);
    if(u.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith("/wikipedia/commons/"))throw Error("Unexpected thumbnail URL");
    const image=await get(u.href,true);
    for(const key of keys){
     const brand=brands.get(key).brand;
     const logo={data:image,brandLogo:true,brandKey:key,brandName:brand.name,author,title:page.title,license:license.name,licenseUrl:license.url,source:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title.replaceAll(" ","_")).replace(/^File%3A/,"File:")};
     if(validBrandLogo(logo,brand)){out[key]=logo;states[key]="verified";}
    }
   }catch(e){recordError("thumbnail",e);for(const key of keys)states[key]="thumbnail-error";}
   if(Date.now()>deadline||Date.now()<blockedUntil)break;
  }
 }catch(e){recordError("commons",e);}
}
for(const key of brands.keys())if(!states[key])states[key]="not-verified";
const counts={};for(const v of Object.values(states))counts[v]=(counts[v]||0)+1;
const report={totalBrands:brands.size,brandedPlaces:[...brands.values()].reduce((n,b)=>n+b.branches,0),verifiedLogos:Object.keys(out).length,coveredPlaces:Object.keys(out).reduce((n,key)=>n+brands.get(key).branches,0),statusCounts:counts,errors,brands:[...brands.entries()].map(([key,{brand,branches}])=>({key,name:brand.name,branches,status:states[key],source:out[key]?.source})),generatedAt:new Date().toISOString()};
await writeFile("public/data/brand-logos.js","// Generated verified Commons raster logos; see docs/photo-providers.md.\nexport const brandLogos = "+JSON.stringify(out)+";\n");
await writeFile("docs/brand-logo-coverage.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,brands:undefined,errors:errors.slice(0,8)}));
if(!report.verifiedLogos)throw Error("No verified brand logos; coverage requirement not met");
