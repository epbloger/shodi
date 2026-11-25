import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {chromium} from "playwright";

// Convert the actual Android launcher resource, preserving its design.
const dir="dist/rustore-assets";
await mkdir(dir,{recursive:true});
const icon=await readFile("android/app/src/main/res/drawable-xxxhdpi/ic_launcher_art.webp");
const html=await readFile("dist/shodi.html","utf8");
const browser=await chromium.launch({headless:true,...(process.env.SHODI_BROWSER_EXECUTABLE?{executablePath:process.env.SHODI_BROWSER_EXECUTABLE}:{})});
try{
  const page=await browser.newPage({viewport:{width:405,height:720},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:"reduce",colorScheme:"light"});
  const png=await page.evaluate(async data=>{
    const img=new Image();img.src=data;await img.decode();
    const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#19253b";ctx.fillRect(0,0,512,512);
    const scale=Math.min(512/img.width,512/img.height);const w=img.width*scale,h=img.height*scale;
    ctx.imageSmoothingQuality="high";ctx.drawImage(img,(512-w)/2,(512-h)/2,w,h);
    return canvas.toDataURL("image/png").split(",")[1];
  },"data:image/webp;base64,"+icon.toString("base64"));
  const iconBytes=Buffer.from(png,"base64");
  assert.equal(iconBytes.readUInt32BE(16),512);assert.equal(iconBytes.readUInt32BE(20),512);assert.ok(iconBytes.length<3_000_000);
  await writeFile(dir+"/icon.png",iconBytes);
  const origin="https://appassets.androidplatform.net";
  await page.route("**/*",route=>route.request().url()===origin+"/assets/index.html"?route.fulfill({contentType:"text/html",body:html}):route.abort());
  await page.goto(origin+"/assets/index.html");
  await page.locator("#guide-panel").waitFor({state:"visible"});
  await page.locator(".hero-desktop").evaluate(img=>img.decode());
  await page.screenshot({path:dir+"/preview-catalog.png"});
  await page.locator(".place-card").first().scrollIntoViewIfNeeded();
  await page.screenshot({path:dir+"/preview-places.png"});
  await page.locator("#guide-target").selectOption("");
  await page.locator(".place-add").first().click();
  await page.locator("#open-guide-route").click();
  await page.locator("#active-route").waitFor({state:"visible"});
  await page.locator("#route-title").scrollIntoViewIfNeeded();
  await page.screenshot({path:dir+"/preview-route.png"});
  await writeFile(dir+"/README.txt","icon.png: actual launcher artwork, converted to opaque 512x512 PNG.\npreview-*.png: actual bundled web UI at 810x1440; previews, not native Android screenshots.\nUse native emulator/device screenshots for RuStore if required.\n");
  for(const file of ["preview-catalog.png","preview-places.png","preview-route.png"]){
    const bytes=await readFile(dir+"/"+file);assert.equal(bytes.readUInt32BE(16),810);assert.equal(bytes.readUInt32BE(20),1440);assert.ok(bytes.length<3_000_000);
  }
  console.log("RuStore icon and three UI previews generated and validated.");
}finally{await browser.close();}
