import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
const html=await readFile("dist/shodi.html","utf8");
const browser=await chromium.launch({headless:true});
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
  assert.ok(await page.locator(".hero-mobile").isVisible());
  assert.ok(!await page.locator(".hero-desktop").isVisible());
  assert.equal(await page.locator(".place-description:visible").count(),10);
  assert.ok((await page.locator(".place-map").first().textContent()).includes("Подробнее на картах"));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"no horizontal overflow");
  await page.locator("#guide-more").click();
  assert.equal(await page.locator(".place-card").count(),20);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.locator("#scroll-top").waitFor({state:"visible"});
  await page.locator("#scroll-top").click();
  await page.waitForFunction(()=>window.scrollY<5);
  await page.locator("#guide-categories button[value=all]").click();
  assert.equal(await page.locator(".place-card").count(),10);
  await page.locator("#android-about").click();
  await page.waitForFunction(()=>document.readyState==="complete");
  assert.ok(actions.includes("/action/about"));
  await page.locator("#guide-target").selectOption("");
  await page.locator(".place-add").first().click();
  await page.locator("#open-guide-route").click();
  await page.locator("#android-share").click();
  await page.waitForFunction(()=>document.readyState==="complete");
  assert.ok(actions.includes("/action/share"));
  await page.locator("#guide-trigger").click();
  assert.ok(await page.locator("#guide-panel").isVisible());
  await context.setOffline(true);
  await page.locator("#guide-search").fill("музей");
  await page.locator("#guide-search").fill("");
  assert.equal(await page.locator(".place-card").count(),10);
  assert.deepEqual(errors,[]);
  console.log("Mobile standalone UI passed (390px, virtual Android origin, offline interactions)");
} finally {await browser.close();}
