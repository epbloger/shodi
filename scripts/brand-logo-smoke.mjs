import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
import {cities,catalogPlacesForCity} from "../public/guide.js";
const html=await readFile("dist/shodi.html","utf8");
const report=JSON.parse(await readFile("docs/brand-logo-coverage.json","utf8"));
assert.ok(report.verifiedLogos>0);
const sample=cities.flatMap(city=>catalogPlacesForCity(city.id).filter(p=>p.photo?.brandLogo).slice(0,1).map(place=>({city,place}))).at(0);
assert.ok(sample,"No actual bundled brand logo found");
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,offline:true});
 await context.route("**/*",route=>route.request().url()==="https://appassets.androidplatform.net/assets/index.html"?route.fulfill({contentType:"text/html",body:html}):route.abort());
 const page=await context.newPage();
 await page.goto("https://appassets.androidplatform.net/assets/index.html");
 await page.locator("#guide-city").fill(sample.city.label);
 await page.locator("#guide-city").press("Enter");
 await page.locator("#guide-search").fill(sample.place.name);
 const card=page.locator("[data-place-id="+JSON.stringify(sample.place.id)+"]");
 await card.locator(".place-brand-logo").scrollIntoViewIfNeeded();
 await page.waitForFunction(id=>{const img=document.querySelector('[data-place-id="'+id+'"] .place-brand-logo img');return img?.complete&&img.naturalWidth>0;},sample.place.id);
 assert.match(await card.locator("figcaption").textContent(),/Логотип бренда/);
 console.log("Real bundled brand logo verified offline:",sample.place.brand.name);
}finally{await browser.close();}
