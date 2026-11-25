import test from "node:test";
import assert from "node:assert/strict";
import {validateVoyagePhoto} from "../public/voyage-photos.js";
const p={data:"data:image/png;base64,AAAA",title:"File:Exact building.png",author:"Fixture",license:"CC BY-SA 4.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/",source:"https://commons.wikimedia.org/wiki/File:Exact_building.png"};
test("Wikivoyage photo only matches the exact licensed listing file",()=>{
 assert.ok(validateVoyagePhoto(p,{image:"Exact building.png"}));
 assert.equal(validateVoyagePhoto(p,{image:"Different building.png"}),false);
 assert.equal(validateVoyagePhoto({...p,license:"unknown"},{image:"Exact building.png"}),false);
});
