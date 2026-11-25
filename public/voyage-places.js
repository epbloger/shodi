import {voyagePlaces} from "./data/voyage-places.js";
import {normalizedName,distanceMeters,commonsFile} from "./osm-photo-links.js";
export function validateVoyage(row,place){
 if(!row||typeof row.name!=="string"||normalizedName(row.name)!==normalizedName(place.name)||row.kind!==place.kind||!Number.isFinite(row.lat)||!Number.isFinite(row.lon)||distanceMeters(row,place)>120||!Number.isSafeInteger(row.revision)||row.revision<=0||typeof row.title!=="string"||row.title.length<1||row.title.length>250||row.license!=="CC BY-SA 4.0")return null;
 if(typeof row.text!=="string"||row.text.length<70||row.text.length>360||/[<>{}\u0000-\u001f]/.test(row.text))return null;
 if(row.image!==null&&commonsFile("File:"+row.image)!==row.image)return null;
 return row;
}
export function voyagePlace(place){
 const r=Object.hasOwn(voyagePlaces,place.id)?validateVoyage(voyagePlaces[place.id],place):null;
 if(!r)return null;
 return {text:r.text,kind:"wikivoyage-place",source:"https://ru.wikivoyage.org/w/index.php?oldid="+r.revision,license:"https://creativecommons.org/licenses/by-sa/4.0/",title:r.title,image:r.image};
}
