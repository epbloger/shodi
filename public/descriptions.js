import { descriptionRecords } from "./data/place-descriptions.js";
import { importedDescriptions } from "./data/imported-descriptions.js";
const key = value => value.normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").trim().replace(/\s+/g," ");
const index = new Map();
for (const row of [...descriptionRecords, ...importedDescriptions]) {
  if (!Array.isArray(row) || row.length !== 5 || typeof row[0] !== "string" ||
      !Number.isFinite(row[1]) || !Number.isFinite(row[2]) ||
      typeof row[3] !== "string" || !row[3].trim() || row[3].length > 360 ||
      !/^Q[1-9]\d*$/.test(row[4])) continue;
  const k = key(row[0]); if (!index.has(k)) index.set(k, []);
  index.get(k).push(row);
}
export function descriptionForPlace(name,lat,lon) {
  if (typeof name !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const matches = (index.get(key(name)) || []).filter(([,a,b]) => {
    const dy=(lat-a)*111320, dx=(lon-b)*111320*Math.cos(lat*Math.PI/180);
    return Math.hypot(dx,dy) <= 180;
  });
  if (new Set(matches.map(row=>row[4])).size !== 1) return null;
  const row=matches[0];
  return {text:row[3],source:"https://www.wikidata.org/wiki/"+row[4],qid:row[4]};
}
