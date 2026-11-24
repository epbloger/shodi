import test from "node:test";
import assert from "node:assert/strict";
import {brandLabelVariants,linkedDescription,exactLogoTitle} from "../scripts/catalog-match-helpers.mjs";
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

test("direct Commons candidate must be a standalone logo with the exact brand name",()=>{
 assert.equal(exactLogoTitle("File:Coffee Like logo.svg","Coffee Like"),true);
 assert.equal(exactLogoTitle("File:Логотип Ростикс.png","Ростикс"),true);
 assert.equal(exactLogoTitle("File:Coffee Like shop and logo.jpg","Coffee Like"),false);
 assert.equal(exactLogoTitle("File:Other Coffee logo.svg","Coffee Like"),false);
 assert.equal(exactLogoTitle("File:Coffee Like logo 2010.svg","Coffee Like"),false);
 assert.equal(exactLogoTitle("File:Coffee Like.jpg","Coffee Like"),false);
});
