import {writeFile} from "node:fs/promises";
import {placePhotos as previous} from "../public/data/place-photos.js";
import {validatePhoto,unrestrictedPhotoLicense} from "../public/photos.js";
import {currentPlaces} from "../public/data/current-places.js";
import {descriptionForPlace} from "../public/descriptions.js";
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ua="SHODI/2.0 catalog (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)";
async function get(url,json=true){
  let r;
  for(let retry=0;retry<3;retry++){
    r=await fetch(url,{headers:{"User-Agent":ua,"Api-User-Agent":ua},signal:AbortSignal.timeout(30000),redirect:"error"});
    if(r.ok)break;
    const message=(await r.text()).slice(0,250).replace(/\s+/g," ");
    const failure="HTTP "+r.status+" on "+new URL(url).hostname+": "+message;
    if(![429,503].includes(r.status)||retry===2)throw Error(failure);
    const header=r.headers.get("retry-after");
    const seconds=header && /^\d+$/.test(header)?Number(header):header?Math.max(0,(Date.parse(header)-Date.now())/1000):30*2**retry;
    if(seconds>180)throw Error(failure+"; source requested a long cooldown");
    console.warn(failure+"; backing off");
    await pause(Math.max(15,Number.isFinite(seconds)?seconds:30)*1000);
  }
  if(json)return r.json();
  const type=r.headers.get("content-type")?.split(";")[0];
  if(!["image/jpeg","image/png"].includes(type))throw Error("Unsupported thumbnail");
  const reader=r.body.getReader();let total=0;const chunks=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>95000)throw Error("Thumbnail too large");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const b=Buffer.concat(chunks);
  if(type==="image/jpeg"&&!(b[0]===255&&b[1]===216&&b[2]===255))throw Error("Bad JPEG");
  if(type==="image/png"&&!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error("Bad PNG");
  return {data:"data:"+type+";base64,"+b.toString("base64"),bytes:b.length};
}
const catalog = Object.values(currentPlaces).flat().filter(r => !r[6] || ["open","unknown"].includes(r[6]));
const placeIds = catalog.map(r => descriptionForPlace(r[1],r[4],r[5])?.qid ?? null);
const qids = [...new Set(placeIds.filter(Boolean))];
const out={};let bytes=0;
for(const qid of qids){const p=previous[qid];if(validatePhoto(p)&&Object.keys(out).length<100&&bytes+Math.ceil(p.data.length*.75)<=5000000){out[qid]=p;bytes+=Math.ceil(p.data.length*.75);}}
let attempts=0,errors=0,rejectedLicense=0;
for(let i=0;i<qids.length&&Object.keys(out).length<100&&bytes<5000000&&attempts<300;i+=40){
  const ids=qids.slice(i,i+40).filter(q=>!out[q]);if(!ids.length)continue;
  let entities;
  try{const u=new URL("https://www.wikidata.org/w/api.php");u.search=new URLSearchParams({action:"wbgetentities",ids:ids.join("|"),props:"claims",format:"json"});entities=(await get(u)).entities;}catch(e){console.warn("Wikidata request failed:",String(e));errors++;if(errors>=3)break;continue;}
  for(const qid of ids){
    if(Object.keys(out).length>=100||bytes>=5000000||attempts>=300)break;
    const claims=entities?.[qid]?.claims?.P18||[];
    const filename=claims.filter(c=>c.rank!=="deprecated").sort((a,b)=>Number(b.rank==="preferred")-Number(a.rank==="preferred"))[0]?.mainsnak?.datavalue?.value;
    if(typeof filename!=="string"||!/\.(jpe?g|png)$/i.test(filename))continue;
    attempts++;
    try{
      const u=new URL("https://commons.wikimedia.org/w/api.php");
      u.search=new URLSearchParams({action:"query",titles:"File:"+filename,prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"330",format:"json",formatversion:"2"});
      const page=(await get(u)).query?.pages?.[0],info=page?.imageinfo?.[0],m=info?.extmetadata;
      const v=k=>m?.[k]?.value||"";
      const licensed=unrestrictedPhotoLicense(m);
      if(!licensed){rejectedLicense++;continue;}
      const license=licensed.name;
      const author=v("Artist").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
      if(!author||author.length>500)continue;
      const thumb=new URL(info.thumburl);
      if(thumb.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(thumb.hostname)||thumb.port||thumb.username||thumb.password)continue;
      const source="https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title.replaceAll(" ","_")).replace(/^File%3A/,"File:");
      const image=await get(thumb,false);
      const photo={data:image.data,author,title:page.title,license,licenseUrl:licensed.url,source};
      if(validatePhoto(photo)&&bytes+image.bytes<=5000000){out[qid]=photo;bytes+=image.bytes;}
    }catch(e){errors++;console.warn("Skipped",qid,String(e));if(errors>=5)break;}
    await pause(2000);
  }
  if(errors>=15)break;
  await pause(1000);
}
const report={catalogPlaces:catalog.length,coveredPlaces:placeIds.filter(q=>q && Object.hasOwn(out,q)).length,candidateItems:qids.length,photos:Object.keys(out).length,bytes,attempts,errors,rejectedLicense,source:"Wikimedia Commons",generatedAt:new Date().toISOString()};
await writeFile("docs/photo-coverage.json",JSON.stringify(report,null,2)+"\n");
await writeFile("public/data/place-photos.js","// Licensed Wikimedia Commons thumbnails.\nexport const placePhotos = "+JSON.stringify(out)+";\n");
console.log(JSON.stringify(report));
if(report.coveredPlaces===0)throw Error("No licensed place photos imported; refusing an empty photo release");
