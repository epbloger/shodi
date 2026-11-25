import {readFile,writeFile} from "node:fs/promises";
import {validatePhoto} from "../public/photos.js";
import {PHOTO_LIMIT,PHOTO_BYTES_LIMIT,photoBytes} from "./photo-import-policy.mjs";
const raw=await readFile((process.env.IMPORT_DIR+"/public/data/imported-descriptions.js"),"utf8");
const m=/^\/\/[^\n]*\nexport const importedDescriptions = (\[[\s\S]*\]);\n?$/.exec(raw);
if(!m)throw Error("Generated data is not a plain JSON array");
const rows=JSON.parse(m[1]);
for(const row of rows){
  if(!Array.isArray(row)||row.length!==5||typeof row[0]!=="string"||!Number.isFinite(row[1])||Math.abs(row[1])>90||!Number.isFinite(row[2])||Math.abs(row[2])>180||typeof row[3]!=="string"||row[3].length>360||!/^Q[1-9]\d*$/.test(row[4]))throw Error("Malformed imported row");
}
const report=JSON.parse(await readFile((process.env.IMPORT_DIR+"/docs/description-coverage.json"),"utf8"));
if(!Number.isInteger(report.queriedLabels)||report.queriedLabels<=0||report.importedRecords!==rows.length||report.coveredPlaces>report.catalogPlaces)throw Error("Incomplete or inconsistent description import");
await writeFile("public/data/imported-descriptions.js","// Generated from Wikidata CC0; matched by label and coordinates.\nexport const importedDescriptions = "+JSON.stringify(rows)+";\n");
await writeFile("docs/description-coverage.json",JSON.stringify(report,null,2)+"\n");
const photoRaw=await readFile((process.env.IMPORT_DIR+"/public/data/place-photos.js"),"utf8");
const photoMatch=/^\/\/[^\n]*\nexport const placePhotos = (\{[\s\S]*\});\n?$/.exec(photoRaw);
if(!photoMatch)throw Error("Invalid photo manifest");
const photos=JSON.parse(photoMatch[1]);
const entries=Object.entries(photos);
const photoReport=JSON.parse(await readFile((process.env.IMPORT_DIR+"/docs/photo-coverage.json"),"utf8"));
const actualBytes=entries.reduce((sum,[,p])=>sum+photoBytes(p),0);
if(entries.length===0||entries.length>PHOTO_LIMIT||entries.some(([id,p])=>!/^Q[1-9]\d*$/.test(id)||!validatePhoto(p)||!photoBytes(p))||photoReport.photos!==entries.length||!Number.isInteger(photoReport.coveredPlaces)||photoReport.coveredPlaces<=0||photoReport.coveredPlaces>photoReport.catalogPlaces||photoReport.bytes!==actualBytes||actualBytes>PHOTO_BYTES_LIMIT)throw Error("Invalid photo data");
const oldPhotos=(await import("../public/data/place-photos.js")).placePhotos;
const previousCovered=Object.keys(oldPhotos).filter(id=>validatePhoto(oldPhotos[id])&&photoBytes(oldPhotos[id]));
if(previousCovered.some(id=>!Object.hasOwn(photos,id)))throw Error("Photo import would discard a previously verified photo; review before replacing");
await writeFile("public/data/place-photos.js","// Licensed Wikimedia Commons thumbnails.\nexport const placePhotos = "+JSON.stringify(photos)+";\n");
await writeFile("docs/photo-coverage.json",JSON.stringify(photoReport,null,2)+"\n");
