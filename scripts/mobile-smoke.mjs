import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {hasUsefulDescription} from "../public/catalog-presentation.js";
const html=await readFile("dist/shodi.html","utf8");
function findSample(predicate){
  for(const city of cities){const place=catalogPlacesForCity(city.id).find(p=>!p.unavailable&&predicate(p));if(place)return {city,place};}
}
const browser=await chromium.launch({headless:true, ...(process.env.SHODI_BROWSER_EXECUTABLE ? {executablePath:process.env.SHODI_BROWSER_EXECUTABLE} : {})});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const page=await context.newPage();
  const errors=[], actions=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error"&&/Content Security Policy|Refused to execute|Refused to apply/i.test(m.text()))errors.push(m.text());});
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin==="https://appassets.androidplatform.net"&&url.pathname==="/assets/index.html")
      return route.fulfill({contentType:"text/html",body:html});
    if(url.origin==="https://appassets.androidplatform.net"&&["/action/about","/action/share"].includes(url.pathname)){
      actions.push(url.pathname);return route.fulfill({status:204});
    }
    return route.abort();
  });
  await page.goto("https://appassets.androidplatform.net/assets/index.html");
  await page.locator("#guide-panel").waitFor({state:"visible"});
  assert.equal(await page.locator(".place-card").count(),10);
  const hero=page.locator(".guide-hero .hero-desktop");
  assert.equal(await hero.count(),1,"one mobile hero photograph");
  assert.ok(await hero.isVisible(),"mobile hero photograph is visible");
  assert.equal(await page.locator(".hero-mobile").count(),0,"old illustration removed");
  await hero.evaluate(img=>img.decode());
  assert.deepEqual(await hero.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1440,960]);
  assert.match(await hero.getAttribute("src"),/^data:image\/webp;base64,/,"hero photograph bundled offline");
  const initialIds=await page.locator(".place-card").evaluateAll(cards=>cards.map(c=>c.dataset.placeId));
  const initialPlaces=new Map(catalogPlacesForCity("spb").map(p=>[p.id,p]));
  for(const id of initialIds){
    const place=initialPlaces.get(id);
    assert.ok(place,"Unknown initial card");
    const card=page.locator("[data-place-id="+JSON.stringify(id)+"]");
    assert.equal(await card.locator(".place-description").isVisible(),hasUsefulDescription(place),"Only source-backed descriptions are visible");
    assert.equal(await card.locator(".place-cover").isVisible(),false,"No empty cover on ordinary cards");
    assert.ok(await card.locator(".place-map").isVisible(),"Map detail remains available for every place");
  }
  const ordinary=findSample(p=>!p.brand&&!p.photo&&!hasUsefulDescription(p)&&p.kind==="food");
  assert.ok(ordinary,"Expected at least one map-only venue");
  assert.ok((await page.locator(".place-map").first().textContent()).includes("Подробнее на картах"));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"no horizontal overflow");
  const firstCard=await page.locator(".place-card").first().elementHandle();
  await page.locator("#guide-more").click();
  assert.equal(await page.locator(".place-card").count(),20);
  assert.ok(await firstCard.evaluate(card=>card.isConnected && card===document.querySelector(".place-card")),"Pagination preserves existing cards");
  assert.equal(new Set(await page.locator(".place-card").evaluateAll(cards=>cards.map(c=>c.dataset.placeId))).size,20);
  assert.ok(await page.locator(".place-add").first().evaluate(b=>b.getBoundingClientRect().height>=44),"Touch target is at least 44 CSS pixels");
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.locator("#scroll-top").waitFor({state:"visible"});
  await page.locator("#scroll-top").click();
  await page.waitForFunction(()=>window.scrollY<5);
  await page.locator("#guide-categories button[value=all]").click();
  assert.equal(await page.locator(".place-card").count(),10);
  const originalTheme=await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme-toggle").click();
  const alternateTheme=await page.locator("html").getAttribute("data-theme");
  assert.notEqual(alternateTheme,originalTheme);
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"),alternateTheme);
  await page.locator("#theme-toggle").click();
  await page.locator("#android-about").click();
  await page.waitForFunction(()=>document.readyState==="complete");
  assert.ok(actions.includes("/action/about"));
  await page.locator("#guide-target").selectOption("");
  const mapHref=await page.locator(".place-map").first().getAttribute("href");
  await page.locator(".place-add").first().click();
  await page.locator("#open-guide-route").click();
  assert.equal(await page.locator(".stop-map").getAttribute("href"),mapHref);
  const savedPlace=initialPlaces.get(initialIds[0]);
  assert.equal(await page.locator(".stop-address").textContent(),savedPlace.address ? "Адрес по каталогу: "+savedPlace.address : "");
  await page.locator("#add-stop").click();
  await page.locator("#edit-form [name=name]").fill("Своя остановка");
  await page.locator("#edit-form [name=address]").fill("Невский проспект, 1");
  await page.locator("#edit-form button[type=submit]").click();
  const manual=page.locator(".stop-card").filter({hasText:"Своя остановка"});
  assert.equal(await manual.locator(".stop-address").textContent(),"Адрес: Невский проспект, 1");
  assert.match(new URL(await manual.locator(".stop-map").getAttribute("href")).searchParams.get("text"),/Невский проспект, 1/);
  await manual.locator(".move-up").click();
  assert.equal(await page.locator(".stop-title").first().textContent(),"Своя остановка");
  await manual.locator(".visit-toggle").click();
  assert.equal(await manual.locator(".visit-toggle").isChecked(),true);
  await manual.locator(".edit-stop").click();
  assert.equal(await page.locator("#edit-form [name=address]").inputValue(),"Невский проспект, 1");
  await page.locator("#edit-form [name=address]").fill("Невский проспект, 2");
  await page.locator("#edit-form button[type=submit]").click();
  assert.equal(await manual.locator(".stop-address").textContent(),"Адрес: Невский проспект, 2");
  await page.locator("#android-share").click();
  await page.waitForFunction(()=>document.readyState==="complete");
  assert.ok(actions.includes("/action/share"));
  await context.setOffline(true);
  await page.reload();
  await page.locator(".stop-card").first().waitFor({state:"visible"});
  assert.equal(await page.locator(".stop-map").last().getAttribute("href"),mapHref);
  assert.equal(await manual.locator(".stop-address").textContent(),"Адрес: Невский проспект, 2");
  assert.equal(await manual.locator(".visit-toggle").isChecked(),true);
  await manual.locator(".remove-stop").click();
  await page.locator("#delete-form button[value=confirm]").click();
  await manual.waitFor({state:"detached"});
  await page.locator("#remove-route").click();
  await page.locator("#delete-form button[value=cancel]").click();
  assert.equal(await page.locator(".stop-card").count(),1);
  await page.locator("#remove-route").click();
  await page.locator("#delete-form button[value=confirm]").click();
  await page.locator("#empty-board").waitFor({state:"visible"});
  await page.reload();
  assert.equal(await page.locator(".stop-card").count(),0);
  await page.locator("#guide-trigger").click();
  assert.ok(await page.locator("#guide-panel").isVisible());
  await context.setOffline(true);
  await page.locator("#guide-search").fill("музей");
  await page.locator("#guide-search").fill("");
  assert.equal(await page.locator(".place-card").count(),10);
  // Exercise one actually imported thumbnail; do not substitute a stock photo.
  await page.locator("#guide-city").fill(ordinary.city.label);
  await page.locator("#guide-city").press("Enter");
  await page.reload();
  assert.equal(await page.locator("#guide-city").inputValue(),ordinary.city.label);
  assert.ok(await page.locator(".place-card").count()<=10);
  await page.locator("#guide-search").fill(ordinary.place.name.slice(0,100));
  const ordinaryCard=page.locator("[data-place-id="+JSON.stringify(ordinary.place.id)+"]");
  await ordinaryCard.waitFor({state:"visible"});
  assert.equal(await ordinaryCard.locator(".place-description").isVisible(),false);
  assert.equal(await ordinaryCard.locator(".place-cover").isVisible(),false);
  assert.ok(await ordinaryCard.locator(".place-map").isVisible());
  assert.match(await ordinaryCard.locator(".place-map").getAttribute("href"),/^https:\/\//);
  const sample = findSample(p=>p.photo);
  if(sample){
    await page.locator("#guide-city").fill(sample.city.label);
    await page.locator("#guide-city").press("Enter");
    await page.locator("#guide-search").fill(sample.place.name.slice(0,100));
    const card=page.locator("[data-place-id="+JSON.stringify(sample.place.id)+"]");
    const image=card.locator(".place-photo img");
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll(".place-photo:not([hidden]) img")).some(img=>img.complete&&img.naturalWidth>0));
    assert.ok((await card.locator(".place-photo figcaption").textContent()).includes("Wikimedia Commons"));
    assert.ok((await image.getAttribute("src")).startsWith("data:image/"));
    console.log("Imported photo verified offline:",sample.place.name);
  }else console.log("No imported photos yet; offline photo UI coverage deferred");
  assert.deepEqual(errors,[]);
  for(const width of [320,760,844]){
    await page.setViewportSize({width,height:640});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow at ${width}px`);
  }
  console.log("Mobile standalone UI passed (390px, virtual Android origin, offline interactions)");
} finally {await browser.close();}
