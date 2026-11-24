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
async function cacheWrite(id,photo){
  try{const d=await db();await new Promise((resolve,reject)=>{
    const tx=d.transaction("photos","readwrite"),store=tx.objectStore("photos");
    store.put({id,photo,at:Date.now()});
    const r=store.getAll();
    r.onsuccess=()=>{const old=r.result.sort((a,b)=>a.at-b.at);for(const entry of old.slice(0,Math.max(0,old.length-CACHE_LIMIT)))store.delete(entry.id);};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}catch{}
}
let cooldown=0,lastRequest=0;
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
async function lookup(place){
  let ids=[];
  if(QID.test(place.photoItem||""))ids=[place.photoItem];
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
    const result=await request("commons.wikimedia.org",{action:"query",titles:"File:"+filename,prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"330",formatversion:"2"});
    const page=result.query?.pages?.[0],info=page?.imageinfo?.[0];
    const license=unrestrictedPhotoLicense(info?.extmetadata);
    const author=String(info?.extmetadata?.Artist?.value||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
    const url=thumbnailUrl(info?.thumburl);
    if(!license||!url||!author||author.length>500||typeof page.title!=="string")continue;
    const response=await fetch(url,{credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",signal:AbortSignal.timeout(12000)});
    if(response.status===429){cooldown=Date.now()+60000;throw Error("Thumbnail rate limit");}
    if(!response.ok)continue;
    const type=response.headers.get("content-type")?.split(";")[0];
    if(!["image/jpeg","image/png"].includes(type))continue;
    const reader=response.body?.getReader();if(!reader)continue;
    const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>95000)throw Error("Thumbnail exceeds size budget");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(type==="image/jpeg"&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))continue;
    if(type==="image/png"&&![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))continue;
    let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const photo={data:"data:"+type+";base64,"+btoa(binary),author,title:page.title,license:license.name,licenseUrl:license.url,source:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title.replaceAll(" ","_")).replace(/^File%3A/,"File:")};
    if(validatePhoto(photo))return photo;
  }
  return null;
}
let queue=Promise.resolve();
const inFlight=new Map(),negative=new Map();
export async function loadPlacePhoto(place){
  if(location.origin!==ORIGIN||typeof place.id!=="string"||typeof place.name!=="string"||place.name.length>80||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return null;
  const saved=await cacheRead(place.id);
  if(saved&&validatePhoto(saved.photo)&&(!navigator.onLine||Date.now()-saved.at<CACHE_TTL))return saved.photo;
  if(!navigator.onLine||Date.now()<cooldown||(negative.get(place.id)||0)>Date.now())return saved&&validatePhoto(saved.photo)?saved.photo:null;
  if(inFlight.has(place.id))return inFlight.get(place.id);
  if(inFlight.size>=20)return null;
  const promise=queue.then(async()=>{
    if(!navigator.onLine||Date.now()<cooldown)return null;
    try{const photo=await lookup(place);
      if(photo){await cacheWrite(place.id,photo);return photo;}
      if(negative.size>=1000)negative.clear();
      negative.set(place.id,Date.now()+3600000);
    }catch{negative.set(place.id,Date.now()+120000);}
    return saved&&validatePhoto(saved.photo)?saved.photo:null;
  });
  inFlight.set(place.id,promise);
  queue=promise.catch(()=>null);
  try{return await promise;}finally{inFlight.delete(place.id);}
}
