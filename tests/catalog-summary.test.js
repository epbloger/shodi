import test from "node:test";
import assert from "node:assert/strict";
import {catalogSummary} from "../public/catalog-summary.js";
test("catalog descriptions only present actual source facts",()=>{
 assert.equal(catalogSummary({kind:"food",address:"Москва, Тверская улица, 1",brand:{name:"Пример"}}),"Заведение общественного питания. Местоположение: Москва, Тверская улица, 1. Бренд: Пример.");
 assert.equal(catalogSummary({kind:"family",city:"Казань"}),"Место для семейного досуга. Местоположение: Казань.");
 assert.equal(catalogSummary({kind:"__proto__"}),"Место из каталога.");
 assert.ok(catalogSummary({kind:"coffee",address:"а".repeat(220),brand:{name:"б".repeat(120)}}).length<=360);
});
