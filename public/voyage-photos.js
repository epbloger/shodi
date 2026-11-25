import {voyagePhotos} from "./data/voyage-photos.js";
import {validatePhoto} from "./photos.js";
import {commonsFile} from "./osm-photo-links.js";
export function validateVoyagePhoto(photo,voyage){
 return Boolean(voyage?.image&&validatePhoto(photo)&&commonsFile(photo.title)===voyage.image);
}
export function voyagePhotoFor(id,voyage){
 const p=Object.hasOwn(voyagePhotos,id)?voyagePhotos[id]:null;
 return validateVoyagePhoto(p,voyage)?p:null;
}
