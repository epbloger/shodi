import test from "node:test";
import assert from "node:assert/strict";
import {validateOsmFact,osmFactDescription,osmFactPhotoLink} from "../public/osm-place-facts.js";
const p={id:"x",name:"Особняк",kind:"architecture",lat:56.8,lon:60.6};
const r={osm:"way/123",names:["Особняк"],lat:56.8,lon:60.6,kind:"architecture",tags:{start_date:"1896",architect:"А. Петров",heritage:"2",wikidata:"Q123",image:"File:House.jpg"}};
test("strict identity, real facts and photo reference",()=>{
 assert.ok(validateOsmFact(r,p));
 assert.equal(validateOsmFact(r,{...p,lat:57}),null);
 assert.equal(validateOsmFact(r,{...p,name:"Другое"}),null);
 assert.equal(validateOsmFact(r,{...p,kind:"food"}),null);
 assert.match(osmFactDescription(r,p.kind).text,/1896.*А\. Петров/);
 assert.deepEqual(osmFactPhotoLink(r),{qid:"Q123",files:["House.jpg"],osm:["way/123"]});
 assert.equal(osmFactDescription({...r,tags:{wikidata:"Q123"}},"architecture"),null);
 assert.match(osmFactDescription({...r,tags:{cuisine:"georgian;pizza",takeaway:"yes"}},"food").text,/грузинская.*пицца.*навынос/);
});
