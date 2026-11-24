import {writeFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
import {unrestrictedPhotoLicense} from "../public/photos.js";
import {KARTA_API,kartaCandidates} from "../public/kartaview-photos.js";
const origin="https://appassets.androidplatform.net";
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ua="SHODI/2.0 coverage check (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)";
const groups=Object.entries(currentPlaces).filter(([,rows])=>rows.length>=30).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
const sample=[];
for(const rank of [0,1,2,4,7,11,17,25,39,59,89,Math.floor(groups.length*.65)]){
 const group=groups[rank];if(!group)continue;
 const [city,rows]=group;
 const pool=rows.filter(r=>["food","coffee","night"].includes(r[2])&&["open","unknown",undefined].includes(r[6])&&Number.isFinite(r[4])&&Number.isFinite(r[5])).sort((a,b)=>a[0].localeCompare(b[0]));
 if(pool.length){const [id,,kind,,lat,lon]=pool[Math.floor(pool.length/2)];if(!sample.some(p=>p.id===id))sample.push({id,city,kind,lat,lon});}
}
const blocked=new Map();
async function get(url,image=false){
 const host=new URL(url).hostname;
 if(Date.now()<(blocked.get(host)||0))return {error:"provider cooldown"};
 try{
   const r=await fetch(url,{headers:{"User-Agent":ua,Origin:origin},redirect:"error",signal:AbortSignal.timeout(12000)});
   if(r.status===429||r.status===503){const n=Number(r.headers.get("Retry-After"));blocked.set(host,Date.now()+Math.max(60000,Number.isFinite(n)?n*1000:0));}
   if(!r.ok)return {error:"HTTP "+r.status};
   const cors=r.headers.get("access-control-allow-origin"),webviewCors=cors==="*"||cors===origin;
   if(!image)return {data:await r.json(),webviewCors};
   const type=r.headers.get("content-type")?.split(";")[0];
   if(!["image/jpeg","image/png"].includes(type))return {error:"Unexpected image type"};
   const reader=r.body.getReader();let size=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>95000)return {error:"Thumbnail too large"};chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const b=Buffer.concat(chunks);
   const valid=type==="image/jpeg"?b[0]===255&&b[1]===216&&b[2]===255:b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
   return valid?{bytes:size,webviewCors}:{error:"Bad image signature"};
 }catch(e){return {error:String(e).slice(0,180),cause:String(e.cause?.code||"")};}
}
function url(base,params){return base+"?"+new URLSearchParams(params);}
async function commons(p){
 const r=await get(url("https://commons.wikimedia.org/w/api.php",{action:"query",generator:"geosearch",ggscoord:p.lat+"|"+p.lon,ggsradius:"100",ggsnamespace:"6",ggsprimary:"all",ggslimit:"10",prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"330",format:"json",origin:"*",formatversion:"2"}));
 if(r.error)return r;
 const pages=r.data?.query?.pages||[];
 for(const page of pages.slice(0,10)){
   const c=page.imageinfo?.[0];if(!c||!unrestrictedPhotoLicense(c.extmetadata)||!String(c.extmetadata?.Artist?.value||"").trim())continue;
   try{const u=new URL(c.thumburl);if(u.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith("/wikipedia/commons/"))continue;
     const img=await get(u.href,true);if(!img.error)return {available:true,webviewCors:r.webviewCors&&img.webviewCors,bytes:img.bytes};return img;
   }catch{}
 }
 return {available:false,candidates:pages.length};
}
async function karta(p){
 const r=await get(url(KARTA_API,{lat:p.lat.toFixed(5),lng:p.lon.toFixed(5),radius:"100",itemsPerPage:"10"}));
 if(r.error)return r;
 if(!Array.isArray(r.data?.result?.data))return {error:"Unexpected API schema"};
 const rows=kartaCandidates(p,r.data.result.data);
 for(const row of rows){const img=await get(row.url,true);if(!img.error)return {available:true,webviewCors:r.webviewCors&&img.webviewCors,bytes:img.bytes};return img;}
 return {available:false,candidates:r.data.result.data.length};
}
const results=[];
for(const p of sample){
 const row={city:p.city,id:p.id,kind:p.kind,commons:await commons(p)};
 await pause(1200);row.kartaview=await karta(p);results.push(row);console.log(JSON.stringify(row));await pause(1500);
}
const report={sampleSize:results.length,cityCount:new Set(results.map(x=>x.city)).size,method:"Deterministic diagnostic sample of commercial places; not a nationwide estimate",commonsNearbyVerified:results.filter(x=>x.commons.available).length,commonsWebviewReady:results.filter(x=>x.commons.available&&x.commons.webviewCors).length,commonsErrors:results.filter(x=>x.commons.error).length,kartaNearbyVerified:results.filter(x=>x.kartaview.available).length,kartaWebviewReady:results.filter(x=>x.kartaview.available&&x.kartaview.webviewCors).length,kartaErrors:results.filter(x=>x.kartaview.error).length,generatedAt:new Date().toISOString(),results};
await writeFile("photo-source-probe.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({...report,results:undefined}));
