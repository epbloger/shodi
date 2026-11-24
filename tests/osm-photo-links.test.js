import test from "node:test";
import assert from "node:assert/strict";
import {commonsFile,linkFromOsm,matchingLinks} from "../public/osm-photo-links.js";
test("only explicit Commons file links, not categories or arbitrary websites",()=>{
  assert.equal(commonsFile("File:Real_place.jpg"),"Real place.jpg");
  assert.equal(commonsFile("https://commons.wikimedia.org/wiki/File:Real%20place.jpg"),"Real place.jpg");
  for(const link of ["Category:Buildings","https://example.com/Real.jpg","https://commons.wikimedia.org.evil.test/wiki/File:Real.jpg","File:../Real.jpg","File:photo.svg"])assert.equal(commonsFile(link),null);
});
test("match OSM source by exact name and nearby location; reject conflicting IDs",()=>{
  const place={name:"Музей",lat:55.75,lon:37.62};
  const element={type:"node",id:123,lat:55.75,lon:37.62,tags:{name:"Музей",wikidata:"Q123",wikimedia_commons:"File:Real.jpg"}};
  const row=linkFromOsm(element);
  assert.deepEqual(matchingLinks(place,[row]),{qid:"Q123",files:["Real.jpg"],osm:["node/123"]});
  assert.equal(matchingLinks({...place,name:"Другой музей"},[row]),null);
  assert.equal(matchingLinks({...place,lat:56},[row]),null);
  assert.equal(matchingLinks(place,[row,{...row,qid:"Q456",osm:"node/456"}]),null);
});
