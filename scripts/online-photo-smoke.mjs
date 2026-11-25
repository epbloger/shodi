import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {shouldLookupPhoto} from "../public/catalog-presentation.js";
const html=await readFile("dist/shodi.html","utf8");
const origin="https://appassets.androidplatform.net";
const entry=cities.flatMap(city=>catalogPlacesForCity(city.id).filter(p=>!p.photo&&!p.photoItem&&!p.brand&&shouldLookupPhoto(p)&&p.name.length>4&&p.name.length<60).slice(0,1).map(place=>({city,place}))).find(x=>x.city.id!=="spb"&&x.city.id!=="msk");
assert.ok(entry,"Missing non-bundled photo test place");
const {city,place}=entry;
const kartaMode=process.argv.includes("--karta");
const kartaThumb="https://storage13.openstreetcam.org/files/photo/2022/10/6/lth/123_ab.jpg";
const qid="Q987654321",file="SHODI integration fixture.png";
const thumb="https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/SHODI_fixture.png/330px-SHODI_fixture.png";
const apiThumb=thumb+"?utm_source=commons.wikimedia.org&utm_campaign=api&utm_content=thumbnail";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=","base64");
const entity={id:qid,labels:{ru:{value:place.name}},aliases:{},claims:{P625:[{rank:"normal",mainsnak:{datavalue:{value:{latitude:place.lat,longitude:place.lon,globe:"http://www.wikidata.org/entity/Q2"}}}}],P18:[{rank:"normal",mainsnak:{datavalue:{value:file}}}]}};
const metadata={LicenseShortName:{value:"CC BY-SA 4.0"},LicenseUrl:{value:"https://creativecommons.org/licenses/by-sa/4.0/"},Restrictions:{value:[]},Artist:{value:"Fixture author"}};
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let offline=false,matchedRequests=0,offlineExternal=0;
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin&&url.pathname==="/assets/index.html")return route.fulfill({contentType:"text/html",body:html});
    if(offline){offlineExternal++;return route.abort();}
    const headers={"Access-Control-Allow-Origin":"*"};
    const respond=body=>route.fulfill({contentType:"application/json",headers,body:JSON.stringify(body)});
    if(url.hostname==="www.wikidata.org"&&url.pathname==="/w/api.php"){
      if(url.searchParams.get("action")==="wbsearchentities"){
        if(url.searchParams.get("search")===place.name){matchedRequests++;return respond({search:kartaMode?[]:[{id:qid}]});}
        return respond({search:[]});
      }
      if(url.searchParams.get("action")==="wbgetentities")return respond({entities:url.searchParams.get("ids")===qid?{[qid]:entity}:{}});
    }
    if(kartaMode&&url.hostname==="commons.wikimedia.org"&&url.searchParams.get("list")==="geosearch")return respond({query:{geosearch:[]}});
    if(kartaMode&&url.hostname==="api.kartaview.org"&&url.pathname==="/2.0/photo/"){
      const lat=Number(url.searchParams.get("lat")),lng=Number(url.searchParams.get("lng"));
      return respond({result:{data:Math.abs(lat-place.lat)<0.00001&&Math.abs(lng-place.lon)<0.00001?[{lat:place.lat,lng:place.lon,visibility:"public",status:"active",autoImgProcessingStatus:"FINISHED",autoImgProcessingResult:"BLURRED",sequenceId:"123",fileurlLTh:kartaThumb,storage:"storage13",shotDate:"2022-10-06"}]:[]}});
    }
    if(kartaMode&&url.href===kartaThumb)return route.fulfill({contentType:"image/png",headers,body:png});
    if(url.hostname==="commons.wikimedia.org"&&url.searchParams.get("titles")==="File:"+file)return respond({query:{pages:[{title:"File:"+file,imageinfo:[{thumburl:apiThumb,extmetadata:metadata}]}]}});
    if(url.href===thumb)return route.fulfill({contentType:"image/png",headers,body:png});
    return route.abort();
  });
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  async function select(){
    await page.goto(origin+"/assets/index.html");
    await page.locator("#guide-panel").waitFor({state:"visible"});
    await page.locator("#guide-city").fill(city.label);
    await page.locator("#guide-city").press("Enter");
    await page.locator("#guide-search").fill(place.name);
    const card=page.locator(".place-card").filter({has:page.locator(".place-name",{hasText:place.name})}).and(page.locator("[data-place-id="+JSON.stringify(place.id)+"]"));
    await card.scrollIntoViewIfNeeded();
    return card;
  }
  let card=await select();
  await card.locator(".place-photo").waitFor({state:"visible",timeout:90000});
  await page.waitForFunction(id=>{const img=document.querySelector('[data-place-id="'+id+'"] .place-photo img');return img?.complete&&img.naturalWidth>0;},place.id);
  assert.ok(matchedRequests>=1,"No online place lookup performed");
  assert.match(await card.locator(".place-photo figcaption").textContent(),kartaMode?/Фото рядом с местом.*Grab and KartaView Contributors.*CC BY-SA 4.0/:/Fixture author.*CC BY-SA 4.0/);
  assert.match(await card.locator(".place-photo img").getAttribute("src"),/^data:image\/png;base64,/);
  await context.setOffline(true);offline=true;
  card=await select();
  await card.locator(".place-photo").waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(id=>{const img=document.querySelector('[data-place-id="'+id+'"] .place-photo img');return img?.complete&&img.naturalWidth>0;},place.id);
  assert.match(await card.locator(".place-photo figcaption").textContent(),kartaMode?/Grab and KartaView Contributors/:/Fixture author/);
  assert.equal(offlineExternal,0,"Offline page attempted external network");
  assert.deepEqual(errors,[]);
  console.log("Online photo lookup, licensed thumbnail, persistent cache and offline restart passed (mock provider responses)");
}finally{await browser.close();}
