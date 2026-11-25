import {osmPlaceFacts} from "./data/osm-place-facts.js";
import {normalizedName,distanceMeters,commonsFile} from "./osm-photo-links.js";
const clean=(s,n=300)=>typeof s==="string"&&s.length<=n&&!/[<>\u0000-\u001f\u007f@]/.test(s)&&!/(?:https?:\/\/|(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2})/i.test(s)?s.trim():"";
const cuisines={russian:"русская",georgian:"грузинская",uzbek:"узбекская",armenian:"армянская",japanese:"японская",chinese:"китайская",korean:"корейская",vietnamese:"вьетнамская",italian:"итальянская",indian:"индийская",thai:"тайская",turkish:"турецкая",mexican:"мексиканская",european:"европейская",french:"французская",asian:"азиатская",tatar:"татарская",vegetarian:"вегетарианская",vegan:"веганская"};
const dishes={pizza:"пицца",burger:"бургеры",sushi:"суши",coffee_shop:"кофе",coffee:"кофе",sandwich:"сэндвичи",kebab:"кебаб",pancake:"блины",ice_cream:"мороженое",noodle:"лапша",seafood:"морепродукты"};
const list=(s,d)=>[...new Set(String(s||"").split(";").map(x=>x.trim()).filter(x=>Object.hasOwn(d,x)).map(x=>d[x]))].slice(0,4);
export function validateOsmFact(row,p){
 if(!row||!/^(node|way)\/[1-9]\d*$/.test(row.osm)||!Number.isFinite(row.lat)||!Number.isFinite(row.lon)||!Array.isArray(row.names)||!row.names.some(n=>normalizedName(n)===normalizedName(p.name))||distanceMeters(row,p)>80||row.kind!==p.kind||!row.tags||typeof row.tags!=="object"||Array.isArray(row.tags))return null;
 return row;
}
export function osmFactsForPlace(p){return Object.hasOwn(osmPlaceFacts,p.id)?validateOsmFact(osmPlaceFacts[p.id],p):null;}
export function osmFactPhotoLink(row){
 if(!row)return null;
 const qid=/^Q[1-9]\d*$/.test(row.tags.wikidata||"")?row.tags.wikidata:null;
 const files=[...new Set([row.tags.wikimedia_commons,row.tags.image].map(commonsFile).filter(Boolean))];
 return qid||files.length?{qid,files,osm:[row.osm]}:null;
}
export function osmFactDescription(row,kind){
 if(!row)return null;
 const t=row.tags,pieces=[];
 const year=/^(?:1[0-9]{3}|20[0-2][0-9])(?:-\d{2}(?:-\d{2})?)?$/.test(t.start_date||"")?t.start_date.slice(0,4):null;
 if(year)pieces.push(["architecture","walk"].includes(kind)?"В исторических данных объект датируется "+year+" годом.":"В карте дата появления объекта указана как "+year+" год.");
 const architect=clean(t.architect,100),artist=clean(t.artist_name,100);
 if(architect&&["architecture","museum","theater","walk","gallery"].includes(kind))pieces.push("Архитектор: "+architect+".");
 if(artist&&["architecture","walk","gallery"].includes(kind))pieces.push("Автор произведения: "+artist+".");
 if(/^[1-9]\d*$/.test(t.heritage||"")&&["architecture","walk","museum"].includes(kind))pieces.push("Отмечен как объект культурного наследия.");
 if(["food","coffee","night"].includes(kind)){
  const c=list(t.cuisine,cuisines),d=list(t.cuisine,dishes);
  if(c.length)pieces.push("Кухня: "+c.join(", ")+".");
  if(d.length)pieces.push("В числе отмеченных направлений меню — "+d.join(", ")+".");
  if(t.takeaway==="yes"||t.takeaway==="only")pieces.push("В карте отмечена возможность заказа навынос.");
  if(t.outdoor_seating==="yes")pieces.push("По данным карты, есть места на открытом воздухе.");
 }
 const desc=clean(t["description:ru"]||t.description);
 if(desc.length>=45&&/[а-яё]{4}/i.test(desc)&&!/(?:телефон|позвоните|лучш[а-я]+|скидк|акци[яию]|реклам|квартир|частный дом)/i.test(desc))pieces.unshift(desc.replace(/[.!?]+$/,"")+".");
 if(t.wheelchair==="yes")pieces.push("В карте указана доступность для посетителей на колясках.");
 if(t.fee==="no"&&["museum","gallery","park","architecture","walk","view","family"].includes(kind))pieces.push("По данным карты, плата за вход не предусмотрена.");
 const out=[];for(const p of pieces)if((out.join(" ")+" "+p).trim().length<=350)out.push(p);
 const text=out.join(" ");
 return text.length>=45?{text,kind:"osm-facts",source:"https://www.openstreetmap.org/"+row.osm,title:"OpenStreetMap · сведения об объекте"}:null;
}
