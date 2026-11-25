// A geographically close encyclopedia article is not enough: require the name/alias too.
const clean=s=>String(s||"").normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё","е").replace(/[«»"“”]/g,"").replace(/[‐‑–—-]/g," ").replace(/\b(?:гбук|гаук|фгбук|мбук|гбу|гау|кгаук|огуки|мкук)\b/giu," ").replace(/(?:^|\s)(?:гбук|гаук|фгбук|мбук|гбу|гау|кгаук|огуки|мкук)(?=\s|$)/giu," ").replace(/(?:^|\s)им\.(?=\s|$)/giu," имени ").replace(/[.,:;!]/g," ").replace(/\s+/g," ").trim();
export function priorityNames(name,city){
 const variants=String(name||"").split(/\s+\/\s+/).map(clean).filter(Boolean);
 const suffix=city?clean(city):"";
 for(const s of [...variants]){
  if(suffix&&s.endsWith(" ("+suffix+")"))variants.push(s.slice(0,-suffix.length-3).trim());
  if(suffix&&s.endsWith(" "+suffix)&&s.length>suffix.length+8)variants.push(s.slice(0,-suffix.length-1).trim());
  if(suffix&&s.startsWith(suffix+" ")&&s.length>suffix.length+8)variants.push(s.slice(suffix.length+1));
 }
 return [...new Set(variants.filter(s=>s.length>=5))];
}
export function priorityIdentity(page,place,aliases=[]){
 if(!page||!place||!Array.isArray(page.coordinates)||!/^Q[1-9]\d*$/.test(page.pageprops?.wikibase_item||"")||Object.hasOwn(page.pageprops||{},"disambiguation"))return false;
 if(place.qid&&page.pageprops.wikibase_item!==place.qid)return false;
 if(!page.coordinates.some(c=>c.globe==="earth"&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&Math.hypot((place.lat-c.lat)*111320,(place.lon-c.lon)*111320*Math.cos(place.lat*Math.PI/180))<=180))return false;
 const a=priorityNames(place.name,place.city),b=[page.title,...aliases].flatMap(n=>priorityNames(n,place.city));
 if(a.some(n=>b.includes(n)))return true;
 // Word order may vary in formal museum/theatre names; never match a subset or a generic word.
 const key=s=>s.split(" ").sort().join(" ");
 return a.some(n=>n.split(" ").length>=3&&b.some(m=>m.split(" ").length===n.split(" ").length&&key(m)===key(n)));
}
