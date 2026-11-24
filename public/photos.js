import {placePhotos} from "./data/place-photos.js";
export const licenses = Object.freeze({
  "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/",
  "CC0":"https://creativecommons.org/publicdomain/zero/1.0/"
});
export function validatePhoto(p) {
  return Boolean(p && typeof p === "object" &&
    typeof p.data === "string" && p.data.length <= 140000 &&
    /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data) &&
    typeof p.author === "string" && p.author.trim() && p.author.length <= 500 &&
    typeof p.title === "string" && p.title.startsWith("File:") && p.title.length <= 500 &&
    Object.hasOwn(licenses,p.license) && licenses[p.license] === p.licenseUrl &&
    typeof p.source === "string" && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s?#]+$/.test(p.source));
}
export function photoForItem(qid) {
  if (typeof qid !== "string" || !/^Q[1-9]\d*$/.test(qid)) return null;
  const photo = Object.hasOwn(placePhotos,qid) ? placePhotos[qid] : null;
  return validatePhoto(photo) ? photo : null;
}
