import test from "node:test";
import assert from "node:assert/strict";
import {candidateBrandTitles,matchesBrandArticle} from "../public/brand-articles.js";
const brand={key:"name:пример",name:"Пример",qid:null};
const row={title:"Пример (сеть ресторанов)",text:"Пример — российская сеть ресторанов быстрого питания, основанная в начале двухтысячных годов.",qid:"Q123",revision:123,license:"CC BY-SA 4.0"};
test("brand article requires exact name, chain activity, compatible category and valid attribution",()=>{
 assert.ok(matchesBrandArticle(row,brand,["food"]));
 assert.equal(matchesBrandArticle(row,{...brand,qid:"Q234"},["food"]),false);
 assert.equal(matchesBrandArticle({...row,title:"Другой бренд"},brand,["food"]),false);
 assert.equal(matchesBrandArticle({...row,text:"Пример — термин, употребляемый в математике, литературе и других областях человеческой деятельности."},brand,["food"]),false);
 assert.equal(matchesBrandArticle(row,brand,["books"]),false);
 assert.deepEqual(candidateBrandTitles({name:"Кафе"}),[]);
});
