import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validatePhoto} from "../public/photos.js";
import {photoBytes,PHOTO_LIMIT,PHOTO_BYTES_LIMIT} from "./photo-import-policy.mjs";
const raw=await readFile("public/data/place-photos.js","utf8");
const prefix="export const placePhotos = ";
const lines=raw.trimEnd().split("\n");
assert.ok(lines.length===2&&lines[0].startsWith("//")&&lines[1].startsWith(prefix)&&lines[1].endsWith(";"));
const rows=Object.entries(JSON.parse(lines[1].slice(prefix.length,-1)));
let bytes=0;
for(const [id,p] of rows){assert.ok(/^Q[1-9]\d*$/.test(id)&&validatePhoto(p)&&photoBytes(p),"Invalid photo "+id);bytes+=photoBytes(p);}
const report=JSON.parse(await readFile("docs/photo-coverage.json","utf8"));
assert.equal(rows.length,report.photos);
assert.equal(bytes,report.bytes);
assert.ok(rows.length>=500&&rows.length<=PHOTO_LIMIT&&bytes<=PHOTO_BYTES_LIMIT);
console.log("Verified place photo bundle:",rows.length,bytes);
