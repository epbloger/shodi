import test from "node:test";
import assert from "node:assert/strict";
import {createNearbyContext,straightDistance} from "../public/catalog-context.js";
const a=["a","Кофейня А","coffee","",56,60,"unknown"],b=["b","Музей города","museum","",56.002,60,"unknown"],c=["c","Парк","park","",56.0002,60,"unknown"],d=["d","Галерея","gallery","",56.0004,60,"closed"],e=["e","Кофейня А","coffee","",56.0005,60,"unknown"];
test("uses real nearby distinct places, not generic names or closed places",()=>{
 const ctx=createNearbyContext([a,b,c,d,e])(a);
 assert.equal(ctx.id,"b");assert.ok(Math.abs(straightDistance(a,b)-222)<2);
 assert.match(ctx.text,/Музей города.*по прямой/);
 assert.equal(createNearbyContext([a])(a),null);
});
