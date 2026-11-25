import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {brandLogos} from "../public/data/brand-logos.js";
import {placePhotos} from "../public/data/place-photos.js";
import {voyagePhotos} from "../public/data/voyage-photos.js";
const html=await readFile("dist/shodi.html","utf8");
const report=JSON.parse(await readFile("docs/brand-logo-coverage.json","utf8"));
assert.ok(report.verifiedLogos>0);
const branded=cities.flatMap(city=>catalogPlacesForCity(city.id).filter(p=>p.photo?.brandLogo).map(place=>({city,place})));
const byBrand=new Map();
for(const entry of branded)if(!byBrand.has(entry.place.brand.key))byBrand.set(entry.place.brand.key,entry);
assert.ok(byBrand.size,"No actual bundled brand logo found");
const sample=[...byBrand.values()].slice(0,3);
for(const key of ["Q112406961","Q177054"])if(byBrand.has(key)&&!sample.some(e=>e.place.brand.key===key))sample.push(byBrand.get(key));
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,offline:true});
 await context.route("**/*",route=>route.request().url()==="https://appassets.androidplatform.net/assets/index.html"?route.fulfill({contentType:"text/html",body:html}):route.abort());
 const page=await context.newPage();
 // Decode every bundled raster, including images not represented in the UI sample.
 const allImages=[...Object.entries(brandLogos).map(([key,p])=>({key:"brand:"+key,data:p.data})),...Object.entries(placePhotos).map(([key,p])=>({key:"photo:"+key,data:p.data})),...Object.entries(voyagePhotos).map(([key,p])=>({key:"voyage:"+key,data:p.data}))];
 for(let i=0;i<allImages.length;i+=20){
  const failures=await page.evaluate(async batch=>Promise.all(batch.map(async ({key,data})=>{
   try{const img=new Image();img.src=data;await img.decode();return img.naturalWidth>0&&img.naturalHeight>0?null:key;}
   catch{return key;}
  })),allImages.slice(i,i+20));
  assert.deepEqual(failures.filter(Boolean),[],"Undecodable bundled raster");
 }
 console.log("Decoded all bundled rasters offline:",allImages.length);
 await page.goto("https://appassets.androidplatform.net/assets/index.html");
 for(const entry of sample){
 await page.locator("#guide-city").fill(entry.city.label);
 await page.locator("#guide-city").press("Enter");
 await page.locator("#guide-search").fill(entry.place.name);
 const card=page.locator("[data-place-id="+JSON.stringify(entry.place.id)+"]");
 await card.locator(".place-brand-logo").scrollIntoViewIfNeeded();
 await page.waitForFunction(id=>{const img=document.querySelector('[data-place-id="'+id+'"] .place-brand-logo img');return img?.complete&&img.naturalWidth>0;},entry.place.id);
 assert.match(await card.locator("figcaption").textContent(),/Логотип бренда/);
 console.log("Real bundled brand logo verified offline:",entry.place.brand.name);
 }
}finally{await browser.close();}
