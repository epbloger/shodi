export function brandLabelVariants(name){
 const raw=String(name||"").normalize("NFC").trim();
 if(!raw)return [];
 const lower=raw.toLocaleLowerCase("ru");
 const title=lower.replace(/(^|[\s-])(\p{L})/gu,(_,prefix,letter)=>prefix+letter.toLocaleUpperCase("ru"));
 return [...new Set([raw,lower,title,raw.toLocaleUpperCase("ru")])];
}
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").trim().replace(/\s+/g," ");
export function linkedDescription(entity,place,qid){
 if(!entity||entity.id!==qid||!/^Q[1-9]\d*$/.test(qid)||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return null;
 const names=["ru","en"].flatMap(lang=>[entity.labels?.[lang]?.value,...(entity.aliases?.[lang]||[]).map(x=>x.value)]);
 if(!names.some(n=>norm(n)===norm(place.name)))return null;
 const description=entity.descriptions?.ru?.value;
 if(typeof description!=="string"||description.trim().length<12||description.length>360)return null;
 const coords=(entity.claims?.P625||[]).filter(c=>c.rank!=="deprecated").map(c=>c.mainsnak?.datavalue?.value).filter(c=>c&&c.globe==="http://www.wikidata.org/entity/Q2"&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180);
 const nearby=coords.filter(c=>Math.hypot((place.lat-c.latitude)*111320,(place.lon-c.longitude)*111320*Math.cos(place.lat*Math.PI/180))<=180);
 if(!nearby.length)return null;
 return [place.name,nearby[0].latitude,nearby[0].longitude,description.trim().replace(/\s+/g," "),qid];
}
