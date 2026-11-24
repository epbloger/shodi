import {wikiSummaries} from "./data/wiki-summaries.js";
export const WIKI_LICENSE="https://creativecommons.org/licenses/by-sa/4.0/";
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").replace(/[«»"“”]/g,"").trim().replace(/\s+/g," ");
export function validWikiSummary(row){
 return Boolean(row&&typeof row.text==="string"&&row.text.length>=70&&row.text.length<=360&&typeof row.title==="string"&&row.title.length>0&&row.title.length<=250&&Number.isSafeInteger(row.revision)&&row.revision>0&&/^Q[1-9]\d*$/.test(row.qid)&&!/[<>\u0000-\u001f]/.test(row.text)&&row.license==="CC BY-SA 4.0");
}
export function wikiResult(row,kind){
 if(!validWikiSummary(row))return null;
 const text=kind==="wikipedia-brand"?"О бренде: "+row.text:row.text;
 return text.length<=360?{text,source:"https://ru.wikipedia.org/w/index.php?oldid="+row.revision,kind,license:WIKI_LICENSE,title:row.title}:null;
}
export function wikiSummaryForPlace(id,details,brand){
 const direct=wikiSummaries[id];
 if(direct&&(!details?.qid||direct.qid===details.qid)){const r=wikiResult(direct,"wikipedia-place");if(r)return r;}
 if(details?.qid){const r=wikiResult(wikiSummaries[details.qid],"wikipedia-place");if(r)return r;}
 return brand?.qid?wikiResult(wikiSummaries["brand:"+brand.qid],"wikipedia-brand"):null;
}
export function exactNearbyArticle(page,place){
 return Boolean(page&&Array.isArray(page.coordinates)&&/^Q[1-9]\d*$/.test(page.pageprops?.wikibase_item||"")&&!Object.hasOwn(page.pageprops||{},"disambiguation")&&norm(page.title)===norm(place.name)&&page.coordinates.some(c=>c.globe==="earth"&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&Math.hypot((place.lat-c.lat)*111320,(place.lon-c.lon)*111320*Math.cos(place.lat*Math.PI/180))<=180));
}
