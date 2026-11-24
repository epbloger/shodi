import test from "node:test";
import assert from "node:assert/strict";
import {catalogSummary,specificType} from "../public/catalog-summary.js";
test("specific source category makes descriptions materially different",()=>{
 assert.equal(catalogSummary({kind:"food",address:"Москва, Тверская улица, 1",brand:{name:"Пример"},tokens:["pizza_restaurant","restaurant"]}),"Пиццерия, специализирующаяся на пицце. Бренд — «Пример». Адрес: Москва, Тверская улица, 1.");
 assert.match(catalogSummary({kind:"family",city:"Казань",tokens:["cinema"]}),/^Кинотеатр/);
 assert.match(catalogSummary({kind:"family",city:"Казань",tokens:["zoo"]}),/^Зоопарк/);
 assert.equal(specificType("park",["pizza_restaurant"]),null);
 assert.equal(catalogSummary({kind:"__proto__"}),"Место из каталога.");
 assert.ok(catalogSummary({kind:"coffee",address:"а".repeat(220),brand:{name:"б".repeat(120)}}).length<=360);
});
