import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {currentPlaces} from "../public/data/current-places.js";
const raw=await readFile("public/data/place-taxonomy.js","utf8");
const match=/^\/\/[^\n]*\nexport const placeTaxonomy = (\{[^\n]*\});\n?$/.exec(raw);
assert.ok(match,"Malformed taxonomy manifest");
const rows=Object.entries(JSON.parse(match[1]));
const ids=new Set(Object.values(currentPlaces).flat().map(p=>p[0]));
const sourceIds=[...ids].filter(id=>/-o[0-9a-f]{12}$/.test(id));
assert.ok(rows.length>=sourceIds.length*.95,"Insufficient imported taxonomy");
for(const [id,tokens] of rows){
 assert.ok(ids.has(id)&&Array.isArray(tokens)&&tokens.length>0&&tokens.length<=20&&tokens.every(x=>typeof x==="string"&&/^[a-z][a-z0-9_]{0,100}$/.test(x)));
}
console.log("Validated taxonomy records:",rows.length);
