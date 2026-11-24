export const KARTA_API="https://api.kartaview.org/2.0/photo/";
export const KARTA_LICENSE="https://creativecommons.org/licenses/by-sa/4.0/";
export const KARTA_AUTHOR="© Grab and KartaView Contributors";
export function kartaThumbnail(value,storage){
  try{
    if(typeof value!=="string")return null;
    let u;
    if(/^storage[1-9]\d*\/files\/photo\//.test(value)){
      const [host,...path]=value.split("/");
      u=new URL("https://"+host+".openstreetcam.org/"+path.join("/"));
    }else u=new URL(value);
    if(u.protocol!=="https:"||!/^storage[1-9]\d*\.openstreetcam\.org$/.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash)return null;
    if(!/^\/files\/photo\/\d{4}\/\d{1,2}\/\d{1,2}\/(?:lth|th)\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png)$/i.test(u.pathname))return null;
    if(/^storage[1-9]\d*$/.test(storage||""))u.hostname=storage+".openstreetcam.org";
    return u.href;
  }catch{return null;}
}
export function kartaCandidates(place,rows){
  if(!Array.isArray(rows)||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return [];
  return rows.flatMap(row=>{
    if(!row||row.visibility!=="public"||row.status!=="active"||row.autoImgProcessingStatus!=="FINISHED"||row.autoImgProcessingResult!=="BLURRED")return [];
    if(!/^[1-9]\d*$/.test(String(row.sequenceId||""))||row.lat==null||row.lng==null||!Number.isFinite(Number(row.lat))||!Number.isFinite(Number(row.lng)))return [];
    const meters=Math.round(Math.hypot((place.lat-Number(row.lat))*111320,(place.lon-Number(row.lng))*111320*Math.cos(place.lat*Math.PI/180)));
    const url=kartaThumbnail(row.fileurlLTh,row.storage)||kartaThumbnail(row.fileurlTh,row.storage);
    if(!url||meters>100)return [];
    const date=/^\d{4}-\d{2}-\d{2}/.exec(String(row.shotDate||""))?.[0]||"";
    return [{url,meters,date,sequence:String(row.sequenceId)}];
  }).sort((a,b)=>a.meters-b.meters||b.date.localeCompare(a.date)).slice(0,2);
}
export function kartaRecord(candidate,data){
  return {provider:"kartaview",data,author:KARTA_AUTHOR,title:"Уличный снимок KartaView",license:"CC BY-SA 4.0",licenseUrl:KARTA_LICENSE,source:candidate.url,sequenceUrl:"https://kartaview.org/details/"+candidate.sequence,nearby:true,nearbyMeters:candidate.meters,captureDate:candidate.date};
}
export function validKartaPhoto(p){
  return Boolean(p?.provider==="kartaview"&&p.author===KARTA_AUTHOR&&p.license==="CC BY-SA 4.0"&&p.licenseUrl===KARTA_LICENSE&&p.nearby===true&&Number.isInteger(p.nearbyMeters)&&p.nearbyMeters>=0&&p.nearbyMeters<=100&&typeof p.data==="string"&&p.data.length<=140000&&/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data)&&kartaThumbnail(p.source)===p.source&&/^https:\/\/kartaview\.org\/details\/[1-9]\d*$/.test(p.sequenceUrl)&&typeof p.captureDate==="string"&&/^(?:\d{4}-\d{2}-\d{2})?$/.test(p.captureDate));
}
