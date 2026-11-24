import {osmPhotoLinks} from "./data/osm-photo-links.js";
const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
export const normalizedName=value=>String(value||"").normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").replace(/[«»"“”]/g,"").trim().replace(/\s+/g," ");
export function commonsFile(value){
  if(typeof value!=="string"||value.length>600)return null;
  let name=value.trim();
  if(/^https:\/\//i.test(name)){
    try{const url=new URL(name);if(url.hostname!=="commons.wikimedia.org"||url.port||url.username||url.password||url.search||url.hash||!url.pathname.startsWith("/wiki/File:"))return null;name=decodeURIComponent(url.pathname.slice(6));}catch{return null;}
  }
  if(!/^File:/i.test(name))return null;
  name=name.slice(5).replaceAll("_"," ").trim();
  return name.length>0&&name.length<=350&&!/[\u0000-\u001f<>|#?\/\\]/.test(name)&&/\.(jpe?g|png)$/i.test(name)?name:null;
}
export function distanceMeters(a,b){
  return Math.hypot((a.lat-b.lat)*111320,(a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180));
}
export function linkFromOsm(element){
  const tags=element?.tags;
  if(!tags||!["node","way","relation"].includes(element.type)||!Number.isSafeInteger(element.id)||element.id<=0)return null;
  const lat=element.lat??element.center?.lat,lon=element.lon??element.center?.lon;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const names=[tags.name,tags["name:ru"],tags["name:en"],tags.official_name,tags.short_name].filter(n=>typeof n==="string"&&n.length<=180&&n.trim());
  if(!names.length)return null;
  const files=[...new Set([tags.wikimedia_commons,tags.image].map(commonsFile).filter(Boolean))];
  const qid=/^Q[1-9]\d*$/.test(tags.wikidata||"")?tags.wikidata:null;
  if(!files.length&&!qid)return null;
  return {names,lat,lon,files,qid,osm:element.type+"/"+element.id};
}
export function matchingLinks(place,candidates){
  if(!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return null;
  const hits=candidates.filter(row=>row.names.some(n=>normalizedName(n)===normalizedName(place.name))&&distanceMeters(place,row)<=80);
  if(!hits.length)return null;
  const qids=[...new Set(hits.map(x=>x.qid).filter(Boolean))];
  const files=[...new Set(hits.flatMap(x=>x.files))];
  // Different identifiers or unrelated photographs near the same name are ambiguous.
  if(qids.length>1||files.length>2||hits.length>1&&qids.length===0&&files.length!==1)return null;
  return {qid:qids[0]||null,files,osm:hits.map(x=>x.osm).sort()};
}
export function osmPhotoLink(placeId){
  if(typeof placeId!=="string"||!idPattern.test(placeId)||!Object.hasOwn(osmPhotoLinks,placeId))return null;
  const row=osmPhotoLinks[placeId];
  if(!row||!Array.isArray(row.files)||row.files.length>2||row.files.some(name=>commonsFile("File:"+name)!==name)||row.qid!==null&&!/^Q[1-9]\d*$/.test(row.qid)||!Array.isArray(row.osm)||!row.osm.length||row.osm.some(id=>!/^(node|way|relation)\/[1-9]\d*$/.test(id)))return null;
  return row;
}
