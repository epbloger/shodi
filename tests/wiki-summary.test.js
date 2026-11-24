import test from "node:test";
import assert from "node:assert/strict";
import {validWikiSummary,wikiResult,exactNearbyArticle} from "../public/wiki-summary.js";
test("Wikipedia descriptions require a license, revision and exact geographic match",()=>{
 const row={text:"Историческое здание, описание которого приведено в энциклопедическом источнике.",title:"Музей",revision:123,qid:"Q123",license:"CC BY-SA 4.0"};
 assert.ok(validWikiSummary(row));
 assert.equal(wikiResult(row,"wikipedia-place").source,"https://ru.wikipedia.org/w/index.php?oldid=123");
 assert.match(wikiResult(row,"wikipedia-brand").text,/^О бренде:/);
 assert.equal(validWikiSummary({...row,license:"unknown"}),false);
 const page={title:"Музей",pageprops:{wikibase_item:"Q123"},coordinates:[{lat:56,lon:60,globe:"earth"}]};
 assert.ok(exactNearbyArticle(page,{name:"Музей",lat:56,lon:60}));
 assert.equal(exactNearbyArticle(page,{name:"Музей",lat:57,lon:60}),false);
 assert.equal(exactNearbyArticle(page,{name:"Галерея",lat:56,lon:60}),false);
});
