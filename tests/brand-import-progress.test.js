import test from "node:test";
import assert from "node:assert/strict";
import {priorAttempts,unresolvedFirst} from "../scripts/brand-import-progress.mjs";
test("never-attempted brands are tried before retries, even with only one branch",()=>{
 const rows=[{brand:{key:"large"},branches:100},{brand:{key:"small"},branches:1},{brand:{key:"medium"},branches:10}];
 const previous={brands:[{key:"large",lastAttemptAt:"2026-01-01T00:00:00.000Z"},{key:"absent",lastAttemptAt:"2026-01-01T00:00:00.000Z"},{key:"medium",lastAttemptAt:"invalid"}]};
 const attempts=priorAttempts(previous,new Map(rows.map(r=>[r.brand.key,r])),Date.parse("2026-02-01"));
 assert.deepEqual([...attempts.keys()],["large"]);
 assert.deepEqual(unresolvedFirst(rows,attempts).map(r=>r.brand.key),["medium","small","large"]);
 assert.equal(rows[0].brand.key,"large");
});
test("future timestamps and missing reports cannot defer brands",()=>{
 const brands=new Map([["a",{}]]);
 assert.equal(priorAttempts({brands:[{key:"a",lastAttemptAt:"2099-01-01"}]},brands,1000).size,0);
 assert.equal(priorAttempts(null,brands).size,0);
});
