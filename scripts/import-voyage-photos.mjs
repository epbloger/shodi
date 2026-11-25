import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
import {placePhotos} from "../public/data/place-photos.js";
import {voyagePhotos as previous} from "../public/data/voyage-photos.js";
import {voyagePlace} from "../public/voyage-places.js";
import {validateVoyagePhoto} from "../public/voyage-photos.js";
import {unrestrictedPhotoLicense} from "../public/photos.js";
import {commonsFile} from "../public/osm-photo-links.js";
import {thumbnailUrl} from "../public/commons-thumbnail.js";
import {photoBytes,PHOTO_BYTES_LIMIT} from "./photo-import-policy.mjs";
const remaining=Math.max(0,PHOTO_BYTES_LIMIT-Object.values(placePhotos).reduce((n,p)=>n+photoBytes(p),0));
const candidates=new Map();
for(const [id,name,kind,,lat,lon,status] of Object.values(currentPlaces).flat()){
 if(status&&!["open","unknown"].includes(status))continue;
 const v=voyagePlace({id,name,kind,lat,lon});
 if(v?.image)candidates.set(id,v);
}
const out={};let bytes=0,errors=0,rejected=0;
for(const [id,p] of Object.entries(previous)){if(validateVoyagePhoto(p,candidates.get(id))&&photoBytes(p)&&bytes+photoBytes(p)<=remaining){out[id]=p;bytes+=photoBytes(p);}}
const deadline=Date.now()+4*60000;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ready=true;
async function get(url){
 if(!ready||Date.now()>=deadline)throw Error("Source budget exhausted");
 const r=await fetch(url,{headers:{"User-Agent":"SHODI/2.0 catalog (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"},redirect:"error",signal:AbortSignal.timeout(18000)});
 if([429,503].includes(r.status))ready=false;
 if(!r.ok)throw Error("HTTP "+r.status);
 return r;
}
const ids=[...candidates.keys()].filter(id=>!out[id]);
for(let i=0;i<ids.length&&ready&&Date.now()<deadline&&bytes<remaining&&errors<5;i+=10){
 const group=ids.slice(i,i+10),names=[...new Set(group.map(id=>"File:"+candidates.get(id).image))];
 try{
  const u=new URL("https://commons.wikimedia.org/w/api.php");
  u.search=new URLSearchParams({action:"query",titles:names.join("|"),prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"250",format:"json",formatversion:"2",maxlag:"5"});
  const d=await (await get(u)).json();
  if(d.error){if(d.error.code==="maxlag")ready=false;throw Error(d.error.code);}
  for(const page of d.query?.pages||[]){
   if(!ready||Date.now()>=deadline||bytes>=remaining)break;
   const file=commonsFile(page.title),targets=group.filter(id=>candidates.get(id).image===file&&!out[id]);
   if(!targets.length)continue;
   const info=page.imageinfo?.[0],m=info?.extmetadata,license=unrestrictedPhotoLicense(m);
   if(!license){rejected++;continue;}
   const author=String(m?.Artist?.value||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
   const url=thumbnailUrl(info?.thumburl);
   if(!url||!author||author.length>500)continue;
   try{
    const r=await get(url),type=r.headers.get("content-type")?.split(";")[0];
    if(!["image/png","image/jpeg"].includes(type))continue;
    const reader=r.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>95000)throw Error("Thumbnail too large");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const p={data:"data:"+type+";base64,"+Buffer.concat(chunks).toString("base64"),title:page.title,author,license:license.name,licenseUrl:license.url,source:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title.replaceAll(" ","_")).replace(/^File%3A/,"File:")};
    for(const id of targets){if(validateVoyagePhoto(p,candidates.get(id))&&photoBytes(p)===size&&bytes+size<=remaining){out[id]=p;bytes+=size;}}
   }catch(e){errors++;console.warn("Voyage photo skipped:",String(e));}
   await pause(1000);
  }
 }catch(e){errors++;console.warn("Voyage metadata:",String(e));}
 await pause(1100);
}
assert.ok(bytes<=remaining);
await writeFile("public/data/voyage-photos.js","// Verified Commons photographs from matched Wikivoyage listings.\nexport const voyagePhotos = "+JSON.stringify(out)+";\n");
const report={candidates:candidates.size,photos:Object.keys(out).length,bytes,remaining,errors,rejected,source:"Wikimedia Commons / exact Wikivoyage listing"};
await writeFile("docs/voyage-photo-coverage.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
