// Only direct Commons image paths. Wikimedia adds analytics parameters to
// thumbnail URLs; these do not identify the file and need not be requested.
const tracking = new Set(["utm_source","utm_campaign","utm_content","utm_medium","utm_term"]);
export function thumbnailUrl(value){
 if(typeof value!=="string"||!value||value.length>4096)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(u.hostname)||u.port||u.username||u.password||u.hash||!u.pathname.startsWith("/wikipedia/commons/"))return null;
  for(const [key,val] of u.searchParams)if(!tracking.has(key)||val.length>200)return null;
  const thumbnail=/^\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/[^/]+\.(?:png|jpe?g)$/i.test(u.pathname);
  const original=/^\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\.(?:png|jpe?g)$/i.test(u.pathname);
  if(!thumbnail&&!original)return null;
  // Old upload thumbnail links can redirect; use the official new endpoint.
  u.hostname=thumbnail?"thumb.wikimedia.org":"upload.wikimedia.org";
  u.search="";
  return u.href;
 }catch{return null;}
}
