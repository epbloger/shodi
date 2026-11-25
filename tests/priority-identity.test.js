import test from "node:test";
import assert from "node:assert/strict";
import {priorityIdentity} from "../public/priority-identity.js";
const p={name:"ГБУК Областной краеведческий музей",city:"Тверь",lat:56.86,lon:35.9};
const page={title:"Областной краеведческий музей",pageprops:{wikibase_item:"Q123"},coordinates:[{lat:56.86,lon:35.9,globe:"earth"}]};
test("priority article matching requires same identity and coordinates",()=>{
 assert.equal(priorityIdentity(page,p),true);
 assert.equal(priorityIdentity({...page,title:"Тверской музей"},p),false);
 assert.equal(priorityIdentity({...page,title:"Тверской музей"},p,["Областной краеведческий музей"]),true);
 assert.equal(priorityIdentity(page,{...p,lat:57.1}),false);
 assert.equal(priorityIdentity(page,{...p,qid:"Q456"}),false);
 assert.equal(priorityIdentity(page,{...p,name:"Областной краеведческий музей Новая сцена"}),false);
});
