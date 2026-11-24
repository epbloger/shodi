import test from "node:test";
import assert from "node:assert/strict";
import {brandForPlace,brandMatches,logoFiles,brandLicense,validBrandLogo} from "../public/brands.js";
test("seed aliases are exact and category constrained",()=>{
 assert.equal(brandForPlace("fake","Вкусно и точка","food")?.qid,"Q112406961");
 assert.equal(brandForPlace("fake","Бургер Кинг","food")?.qid,"Q177054");
 assert.equal(brandForPlace("fake","Burger King copy","food"),null);
 assert.equal(brandForPlace("fake","Burger King","park"),null);
});
test("brand copyright and trademark conditions are distinct",()=>{
 const m={LicenseShortName:{value:"Public domain"},License:{value:"pd"},Copyrighted:{value:"False"},Restrictions:{value:"trademarked"}};
 assert.equal(brandLicense(m)?.name,"Public domain");
 assert.equal(brandLicense({...m,Copyrighted:{value:"True"}}),null);
 assert.equal(brandLicense({...m,Restrictions:{value:"personality rights"}}),null);
 const b=brandForPlace("fake","Burger King","food");
 const p={brandLogo:true,brandKey:b.key,brandName:b.name,data:"data:image/png;base64,AAAA",author:"Автор не указан",title:"File:Logo.svg",source:"https://commons.wikimedia.org/wiki/File:Logo.svg",license:"Public domain",licenseUrl:"https://creativecommons.org/publicdomain/mark/1.0/"};
 assert.equal(validBrandLogo(p,b),true);
 assert.equal(validBrandLogo({...p,brandKey:"Q1"},b),false);
});
test("P154 logo claim requires current rank and brand match",()=>{
 const b={name:"Example brand",qid:null};
 const e={id:"Q123",labels:{en:{value:"Example brand"}},claims:{P154:[{rank:"normal",mainsnak:{datavalue:{value:"Logo.svg"}}},{rank:"deprecated",mainsnak:{datavalue:{value:"Old.svg"}}}]}};
 assert.equal(brandMatches(e,b),true);
 assert.deepEqual(logoFiles(e),["Logo.svg"]);
});
