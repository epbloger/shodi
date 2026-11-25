import test from "node:test";
import assert from "node:assert/strict";
import {validateVoyage} from "../public/voyage-places.js";
const place={name:"Городской музей",kind:"museum",lat:55,lon:37};
const row={...place,revision:123,title:"Город",text:"Музей расположен в историческом здании. Экспозиция посвящена истории края и его жителям.",license:"CC BY-SA 4.0",image:"Museum.jpg"};
test("Wikivoyage text requires exact place, coordinates, original revision and license",()=>{
 assert.ok(validateVoyage(row,place));
 assert.equal(validateVoyage(row,{...place,lat:56}),null);
 assert.equal(validateVoyage(row,{...place,name:"Музей истории"}),null);
 assert.equal(validateVoyage({...row,license:"unknown"},place),null);
 assert.equal(validateVoyage({...row,image:"https://example.com/photo.jpg"},place),null);
});
