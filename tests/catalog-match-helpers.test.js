import test from "node:test";
import assert from "node:assert/strict";
import {brandLabelVariants,linkedDescription} from "../scripts/catalog-match-helpers.mjs";
test("exact brand lookup includes original, lower, title and uppercase spelling",()=>{
 assert.deepEqual(brandLabelVariants("кофе лайк"),["кофе лайк","Кофе Лайк","КОФЕ ЛАЙК"]);
 assert.ok(brandLabelVariants("coffee-like").includes("Coffee-Like"));
 assert.deepEqual(brandLabelVariants(""),[]);
});
test("OSM-linked description requires verified QID, exact label, earth coordinates and Russian text",()=>{
 const p={name:"Музей города",lat:56,lon:60};
 const entity={id:"Q123",labels:{ru:{value:"Музей города"}},descriptions:{ru:{value:"Городской исторический музей"}},claims:{P625:[{rank:"normal",mainsnak:{datavalue:{value:{latitude:56,longitude:60,globe:"http://www.wikidata.org/entity/Q2"}}}}]}};
 assert.deepEqual(linkedDescription(entity,p,"Q123"),["Музей города",56,60,"Городской исторический музей","Q123"]);
 assert.equal(linkedDescription(entity,p,"Q124"),null);
 assert.equal(linkedDescription(entity,{...p,lat:57},"Q123"),null);
 assert.equal(linkedDescription(entity,{...p,name:"Другой музей"},"Q123"),null);
 assert.equal(linkedDescription({...entity,descriptions:{en:{value:"Museum"}}},p,"Q123"),null);
 assert.equal(linkedDescription({...entity,claims:{}},p,"Q123"),null);
});
