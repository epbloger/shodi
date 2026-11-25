import test from "node:test";
import assert from "node:assert/strict";
import {archiveDescription} from "../public/archive-context.js";
test("archive observations are explicitly dated and never invented",()=>{
 const r=archiveDescription({topics:["coffee","pastry"]});
 assert.match(r.text,/2023.*кофейные напитки и выпечка/);
 assert.equal(r.kind,"archive-context");
 assert.equal(archiveDescription({topics:["coffee"]}),null);
 assert.equal(archiveDescription({topics:["coffee","coffee"]}),null);
 assert.equal(archiveDescription({topics:["coffee","unknown"]}),null);
});
