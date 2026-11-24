import test from "node:test";
import assert from "node:assert/strict";
import {editorialGuide} from "../public/editorial-guide.js";
test("researched visitor context matches the actual place, not another same-name venue",()=>{
 const p={name:"Театр кукол",kind:"theater",lat:56.83835,lon:60.61890};
 assert.match(editorialGuide(p).text,/1932/);
 assert.equal(editorialGuide({...p,lat:55.75,lon:37.62}),null);
 assert.match(editorialGuide({name:"Дом Севастьянова",kind:"architecture",lat:56.83901,lon:60.60594}).text,/1866/);
 assert.equal(editorialGuide({name:"Coffee Like",kind:"coffee"}),null);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Coffee Like",qid:"Q55662627"}}).text,/Ижевске/);
 assert.match(editorialGuide({kind:"food",brand:{name:"Додо Пицца"}}).text,/Сыктывкаре/);
});
