import {brandMatches,logoFiles,brandLicense,validBrandLogo} from "./brands.js";
import {KARTA_API,kartaCandidates,kartaRecord,validKartaPhoto} from "./kartaview-photos.js";
import {validatePhoto,unrestrictedPhotoLicense} from "./photos.js";
const ORIGIN="https://appassets.androidplatform.net";
const QID=/^Q[1-9]\d*$/;
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").trim().replace(/\s+/g," ");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const CACHE_LIMIT=200, CACHE_TTL=30*86400000;
let database;
function db(){
  if(!database)database=new Promise((resolve,reject)=>{
    const req=indexedDB.open("shodi-place-photos",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("photos",{keyPath:"id"});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return database;
}
async function cacheRead(id){
  try{const d=await db();return await new Promise((resolve,reject)=>{
    const r=d.transaction("photos").objectStore("photos").get(id);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });}catch{return null;}
}
const fingerprint=place=>JSON.stringify([place.name,place.lat,place.lon]);
async function cacheWrite(place,photo){
  try{const d=await db();await new Promise((resolve,reject)=>{
    const tx=d.transaction("photos","readwrite"),store=tx.objectStore("photos");
    store.put({id:place.id,fingerprint:fingerprint(place),photo,at:Date.now()});
    const r=store.getAll();
    r.onsuccess=()=>{const old=r.result.sort((a,b)=>a.at-b.at);for(const entry of old.slice(0,Math.max(0,old.length-CACHE_LIMIT)))store.delete(entry.id);};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}catch{}
}
let cooldown=0,lastRequest=0,kartaCooldown=0;
const validCachedPhoto=p=>validatePhoto(p)||validKartaPhoto(p);
async function request(host,params){
  if(Date.now()<cooldown)throw Error("Photo source cooldown");
  const wait=lastRequest+1200-Date.now();if(wait>0)await delay(wait);
  if(!navigator.onLine)throw Error("Offline");
  lastRequest=Date.now();
  const u=new URL("https://"+host+"/w/api.php");
  u.search=new URLSearchParams({...params,format:"json",origin:"*"});
  const r=await fetch(u,{credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",signal:AbortSignal.timeout(12000)});
  if(r.status===429||r.status===503){const header=Number(r.headers.get("Retry-After"));cooldown=Date.now()+Math.max(60000,Number.isFinite(header)?header*1000:60000);}
  if(!r.ok)throw Error("Photo API "+r.status);
  const data=await r.json();if(data.error)throw Error("Photo API error");return data;
}
export function matchingEntity(entity,place){
  if(!entity||!QID.test(entity.id)||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return false;
  const names=["ru","en"].flatMap(lang=>[entity.labels?.[lang]?.value,...(entity.aliases?.[lang]||[]).map(x=>x.value)]);
  if(!names.some(n=>norm(n)===norm(place.name)))return false;
  return (entity.claims?.P625||[]).some(claim=>{
    if(claim.rank==="deprecated")return false;
    const p=claim.mainsnak?.datavalue?.value;
    if(!Number.isFinite(p?.latitude)||!Number.isFinite(p?.longitude)||p.globe!=="http://www.wikidata.org/entity/Q2")return false;
    return Math.hypot((place.lat-p.latitude)*111320,(place.lon-p.longitude)*111320*Math.cos(place.lat*Math.PI/180))<=100;
  });
}
export function thumbnailUrl(value){
  try{const u=new URL(value);
    if(u.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith("/wikipedia/commons/"))return null;
    return u.href;
  }catch{return null;}
}
async function readThumbnail(url,provider){
  const response=await fetch(url,{credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",signal:AbortSignal.timeout(12000)});
  if(response.status===429||response.status===503){if(provider==="kartaview")kartaCooldown=Date.now()+3600000;else cooldown=Date.now()+60000;throw Error("Thumbnail rate limit");}
  if(!response.ok)return null;
  const type=response.headers.get("content-type")?.split(";")[0];
  if(!["image/jpeg","image/png"].includes(type))return null;
  const reader=response.body?.getReader();if(!reader)return null;
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>95000)throw Error("Thumbnail exceeds size budget");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(type==="image/jpeg"&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))return null;
  if(type==="image/png"&&![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return null;
  let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return "data:"+type+";base64,"+btoa(binary);
}
async function getCommonsPhoto(filename,brand=null){
  if(typeof filename!=="string"||filename.length>350||!(brand?/\.(svg|jpe?g|png)$/i:/\.(jpe?g|png)$/i).test(filename))return null;
  const result=await request("commons.wikimedia.org",{action:"query",titles:"File:"+filename,prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"330",formatversion:"2"});
  const page=result.query?.pages?.[0],info=page?.imageinfo?.[0];
  const license=brand?brandLicense(info?.extmetadata):unrestrictedPhotoLicense(info?.extmetadata);
  const author=String(info?.extmetadata?.Artist?.value||(brand&&license?.name==="Public domain"?"Автор не указан":"")).replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
  const url=thumbnailUrl(info?.thumburl);
  if(!license||!url||!author||author.length>500||typeof page.title!=="string")return null;
  const data=await readThumbnail(url,"commons");
  if(!data)return null;
  const photo={data,author,title:page.title,license:license.name,licenseUrl:license.url,source:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title.replaceAll(" ","_")).replace(/^File%3A/,"File:")};
  if(brand){const logo={...photo,brandLogo:true,brandName:brand.name,brandKey:brand.key};return validBrandLogo(logo,brand)?logo:null;}
  if(validatePhoto(photo))return photo;
  return null;
}
// Store one logo per brand, independently of the branch and location.
const brandMemory=new Map(),brandMiss=new Map();
const brandCacheId=brand=>"brand:"+brand.key;
async function readBrand(brand){
 if(!brand)return null;
 const mem=brandMemory.get(brand.key);
 if(mem&&validBrandLogo(mem,brand))return mem;
 const saved=await cacheRead(brandCacheId(brand));
 if(saved&&validBrandLogo(saved.photo,brand)&&(!navigator.onLine||Date.now()-saved.at<CACHE_TTL))return saved.photo;
 return null;
}
async function lookupBrand(brand){
 if(!brand)return null;
 const cached=await readBrand(brand);if(cached)return cached;
 if(Date.now()<cooldown||(brandMiss.get(brand.key)||0)>Date.now())return null;
 let files=brand.file?[brand.file]:[];
 try{
   if(!files.length){
     let ids=brand.qid?[brand.qid]:[];
     if(!ids.length){const result=await request("www.wikidata.org",{action:"wbsearchentities",search:brand.name,language:"ru",uselang:"ru",type:"item",limit:"8"});ids=[...new Set((result.search||[]).map(x=>x.id).filter(x=>QID.test(x)))];}
     if(ids.length){
       const r=await request("www.wikidata.org",{action:"wbgetentities",ids:ids.join("|"),props:"labels|aliases|claims",languages:"ru|en"});
       const matches=Object.values(r.entities||{}).filter(e=>brandMatches(e,brand)&&logoFiles(e).length);
       if(matches.length===1)files=logoFiles(matches[0]);
     }
   }
   for(const file of files){
     const logo=await getCommonsPhoto(file,brand);
     if(logo){
       if(brandMemory.size>=CACHE_LIMIT)brandMemory.clear();
       brandMemory.set(brand.key,logo);
       await cacheWrite({id:brandCacheId(brand),name:brand.name},logo);
       return logo;
     }
   }
   if(brandMiss.size>=1000)brandMiss.clear();
   brandMiss.set(brand.key,Date.now()+3600000);
 }catch{brandMiss.set(brand.key,Date.now()+120000);}
 return null;
}
async function exactPhoto(place){
  for(const file of place.osmPhotoLink?.files||[]){
    const photo=await getCommonsPhoto(file);
    if(photo)return {...photo,osmSource:place.osmPhotoLink.osm[0]};
  }
  let ids=[];
  if(QID.test(place.photoItem||place.osmPhotoLink?.qid||""))ids=[place.photoItem||place.osmPhotoLink.qid];
  else {
    const search=await request("www.wikidata.org",{action:"wbsearchentities",search:place.name,language:"ru",uselang:"ru",type:"item",limit:"8"});
    ids=[...new Set((search.search||[]).map(x=>x.id).filter(id=>QID.test(id)))];
  }
  if(!ids.length)return null;
  const items=await request("www.wikidata.org",{action:"wbgetentities",ids:ids.join("|"),props:"labels|aliases|claims",languages:"ru|en"});
  const matches=Object.values(items.entities||{}).filter(entity=>matchingEntity(entity,place));
  if(matches.length!==1)return null;
  const claims=matches[0].claims?.P18||[];
  for(const claim of claims.filter(x=>x.rank!=="deprecated").sort((a,b)=>Number(b.rank==="preferred")-Number(a.rank==="preferred")).slice(0,2)){
    const filename=claim.mainsnak?.datavalue?.value;
    if(typeof filename!=="string"||filename.length>350||!/\.jpe?g$|\.png$|\.webp$/i.test(filename))continue;
    const photo=await getCommonsPhoto(filename);
    if(photo)return photo;
  }
  return null;
}
// Geotagged surroundings are explicitly not a verified photo of a business.
export function nearbyPhotoCandidates(place,rows){
  if(!Number.isFinite(place.lat)||!Number.isFinite(place.lon)||!Array.isArray(rows))return [];
  return rows.filter(row=>row&&typeof row.title==="string"&&/^File:.{1,350}\.(jpe?g|png)$/i.test(row.title)&&Number.isFinite(row.lat)&&Number.isFinite(row.lon))
    .map(row=>({filename:row.title.slice(5),meters:Math.round(Math.hypot((place.lat-row.lat)*111320,(place.lon-row.lon)*111320*Math.cos(place.lat*Math.PI/180)))}))
    .filter(row=>row.meters<=100)
    .sort((a,b)=>a.meters-b.meters||a.filename.localeCompare(b.filename)).slice(0,3);
}
async function commonsPhoto(place){
  const exact=await exactPhoto(place);
  if(exact)return exact;
  const result=await request("commons.wikimedia.org",{action:"query",list:"geosearch",gscoord:place.lat.toFixed(5)+"|"+place.lon.toFixed(5),gsradius:"100",gsnamespace:"6",gsprimary:"all",gslimit:"20"});
  for(const candidate of nearbyPhotoCandidates(place,result.query?.geosearch)){
    const photo=await getCommonsPhoto(candidate.filename);
    if(photo)return {...photo,nearby:true,nearbyMeters:candidate.meters};
  }
  return null;
}
// The public KartaView API permits 100 requests/hour; budget less than that.
function kartaBudget(){
  try{
    const key="shodi-karta-request-times";
    const now=Date.now();
    const raw=JSON.parse(localStorage.getItem(key)||"[]");
    const used=Array.isArray(raw)?raw.filter(t=>Number.isFinite(t)&&t>now-3600000&&t<=now):[];
    if(used.length>=80)return false;
    used.push(now);localStorage.setItem(key,JSON.stringify(used));return true;
  }catch{return false;}
}
async function kartaPhoto(place){
  if(!navigator.onLine||Date.now()<kartaCooldown||!kartaBudget())return null;
  const u=new URL(KARTA_API);
  u.search=new URLSearchParams({lat:place.lat.toFixed(5),lng:place.lon.toFixed(5),radius:"100",itemsPerPage:"10"});
  const r=await fetch(u,{credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",signal:AbortSignal.timeout(10000)});
  if(r.status===429||r.status===503){const h=Number(r.headers.get("Retry-After"));kartaCooldown=Date.now()+Math.max(3600000,Number.isFinite(h)?h*1000:0);return null;}
  if(!r.ok)return null;
  const result=await r.json();
  for(const candidate of kartaCandidates(place,result.result?.data)){
    const data=await readThumbnail(candidate.url,"kartaview");
    if(data){const photo=kartaRecord(candidate,data);if(validKartaPhoto(photo))return photo;}
  }
  return null;
}
async function lookup(place){
  const logo=await lookupBrand(place.brand);if(logo)return logo;
  if(Date.now()>=cooldown){
    try{const photo=await commonsPhoto(place);if(photo)return photo;}catch{}
  }
  try{return await kartaPhoto(place);}catch{return null;}
}
let queue=Promise.resolve();
const inFlight=new Map(),negative=new Map();
export async function loadPlacePhoto(place,isCurrent=()=>true){
  if(location.origin!==ORIGIN||typeof place.id!=="string"||typeof place.name!=="string"||place.name.length>80||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return null;
  const brandLogo=await readBrand(place.brand);if(brandLogo)return brandLogo;
  const record=await cacheRead(place.id);
  const saved=record?.fingerprint===fingerprint(place)?record:null;
  if(saved&&validCachedPhoto(saved.photo)&&(!navigator.onLine||Date.now()-saved.at<CACHE_TTL))return saved.photo;
  if(!navigator.onLine||(Date.now()<cooldown&&Date.now()<kartaCooldown)||(negative.get(place.id)||0)>Date.now())return saved&&validCachedPhoto(saved.photo)?saved.photo:null;
  if(inFlight.has(place.id))return inFlight.get(place.id);
  if(inFlight.size>=20)return null;
  const promise=queue.then(async()=>{
    if(!isCurrent()||!navigator.onLine||(Date.now()<cooldown&&Date.now()<kartaCooldown))return null;
    try{const photo=await lookup(place);
      if(photo){if(!photo.brandLogo)await cacheWrite(place,photo);return photo;}
      if(negative.size>=1000)negative.clear();
      negative.set(place.id,Date.now()+3600000);
    }catch{negative.set(place.id,Date.now()+120000);}
    return saved&&validCachedPhoto(saved.photo)?saved.photo:null;
  });
  inFlight.set(place.id,promise);
  queue=promise.catch(()=>null);
  try{return await promise;}finally{inFlight.delete(place.id);}
}
