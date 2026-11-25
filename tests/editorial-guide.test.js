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

test("additional researched brands have distinct history and exact identity",()=>{
 assert.match(editorialGuide({kind:"food",brand:{name:"Вкусно — и точка"}}).text,/2022/);
 assert.match(editorialGuide({kind:"food",brand:{name:"Burger King"}}).text,/2010/);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Шоколадница"}}).text,/1964/);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Кофе Хауз"}}).text,/1999/);
 assert.match(editorialGuide({kind:"food",brand:{name:"Папа Джонс"}}).text,/1984/);
 assert.match(editorialGuide({kind:"food",brand:{name:"Якитория"}}).text,/1999/);
 assert.match(editorialGuide({kind:"food",brand:{name:"Теремок"}}).text,/1998/);
 assert.match(editorialGuide({kind:"food",brand:{name:"Subway"}}).text,/1965/);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Буше"}}).text,/1999/);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Surf Coffee"}}).text,/2010/);
 assert.match(editorialGuide({kind:"food",brand:{name:"IL Patio"}}).text,/1993/);
 assert.equal(editorialGuide({kind:"museum",brand:{name:"Шоколадница"}}),null);
});

test("known source-backed chain aliases and significant landmarks receive matching editorial text",()=>{
 assert.match(editorialGuide({kind:"food",brand:{name:"Papa John's Pizza"}}).text,/1984/);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Шоколадница Казань"}}).text,/1964/);
 assert.match(editorialGuide({kind:"coffee",brand:{name:"Cofix Россия"}}).text,/2016/);
 assert.match(editorialGuide({kind:"food",brand:{name:"ТаширПицца"}}).text,/1999/);
 assert.match(editorialGuide({kind:"museum",name:"Музей космонавтики в Калуге",lat:54.516949,lon:36.230686}).text,/1967/);
 assert.equal(editorialGuide({kind:"museum",name:"Музей космонавтики в Калуге",lat:55.75,lon:37.62}),null);
});
