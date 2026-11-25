import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {bundledBrandLogo} from "../public/brands.js";
import {hasUsefulDescription} from "../public/catalog-presentation.js";
const scope=JSON.parse(await readFile("docs/release-priority-scope.json","utf8"));
const all=cities.flatMap(city=>catalogPlacesForCity(city.id));assert.equal(all.length,scope.catalogPlaces);
const byId=new Map(all.map(p=>[p.id,p]));assert.equal(byId.size,all.length);
const brandReport=JSON.parse(await readFile("docs/brand-logo-coverage.json","utf8"));
const groups=scope.brands.map(b=>{
 const cards=all.filter(p=>p.brand?.key===b.key);assert.equal(cards.length,b.branches,"Brand snapshot changed "+b.key);
 return {...b,name:cards[0].brand.name,described:cards.filter(hasUsefulDescription).length,brandDescribed:cards.filter(p=>["editorial-brand","wikipedia-brand"].includes(p.descriptionKind)).length,logo:!!bundledBrandLogo(cards[0].brand),missing:cards.filter(p=>!hasUsefulDescription(p)).map(p=>({id:p.id,name:p.name,kind:p.kind})),logoStatus:brandReport.brands.find(x=>x.key===b.key)?.status};
});
const places=scope.cultural.map(x=>{const p=byId.get(x.id);assert.ok(p&&p.name===x.name&&p.kind===x.kind,"Missing target "+x.id);return {...x,city:p.city,description:hasUsefulDescription(p),substantive:["wikipedia-place","editorial-place","wikivoyage-place"].includes(p.descriptionKind)&&p.description?.length>=70,descriptionKind:p.descriptionKind,photo:!!(p.photo&&!p.photo.brandLogo)};});
const report={baseline:scope.baseline,catalog:all.length,brandGroups:groups.length,brandCards:groups.reduce((n,x)=>n+x.branches,0),brandCardsWithoutDescription:groups.reduce((n,x)=>n+x.branches-x.described,0),brandsWithoutLogo:groups.filter(x=>!x.logo).length,culturalCandidates:places.length,culturalWithoutDescription:places.filter(x=>!x.description).length,culturalWithoutSubstantive:places.filter(x=>!x.substantive).length,culturalWithoutPhoto:places.filter(x=>!x.photo).length,groups,places};
await writeFile("docs/release-priority-report.json",JSON.stringify(report,null,2)+"\n");
console.log("FROZEN RELEASE SCOPE",JSON.stringify({...report,groups:undefined,places:undefined}));
