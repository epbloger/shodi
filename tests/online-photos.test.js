import test from "node:test";
import assert from "node:assert/strict";
import {matchingEntity,thumbnailUrl,nearbyPhotoCandidates} from "../public/online-photos.js";
const place={name:"Тестовый музей",lat:55.75,lon:37.62};
const entity={id:"Q123",labels:{ru:{value:"ТЕСТОВЫЙ МУЗЕЙ"}},claims:{P625:[{rank:"normal",mainsnak:{datavalue:{value:{latitude:55.75,longitude:37.62,globe:"http://www.wikidata.org/entity/Q2"}}}}]}};
test("online images require exact place and coordinates",()=>{
  assert.equal(matchingEntity(entity,place),true);
  assert.equal(matchingEntity(entity,{...place,lat:59.9}),false);
  assert.equal(matchingEntity(entity,{...place,name:"Другой музей"}),false);
  assert.equal(matchingEntity({...entity,claims:{}},place),false);
});
test("online images only from Wikimedia Commons HTTPS",()=>{
  assert.ok(thumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/330px-Test.jpg"));
  for(const url of ["http://upload.wikimedia.org/wikipedia/commons/a.jpg","https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg","https://upload.wikimedia.org/wikipedia/commons/a.jpg?x=1","https://upload.wikimedia.org/other/a.jpg"])assert.equal(thumbnailUrl(url),null);
});

test("nearby photos require actual geotags within 100 meters and image files",()=>{
 const p={lat:55.75,lon:37.62};
 const rows=[{title:"File:Street.jpg",lat:55.7501,lon:37.62},{title:"File:Distant.jpg",lat:55.76,lon:37.62},{title:"File:Wrong.svg",lat:55.75,lon:37.62},{title:"File:Unknown.jpg"}];
 assert.deepEqual(nearbyPhotoCandidates(p,rows),[{filename:"Street.jpg",meters:11}]);
});


test("Commons API tracking parameters do not prevent safe raster downloads",()=>{
 const old="https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Logo.svg/330px-Logo.svg.png";
 const canonical=old.replace("upload.wikimedia.org","thumb.wikimedia.org");
 assert.equal(thumbnailUrl(old),canonical);
 assert.equal(thumbnailUrl(canonical+"?utm_source=commons.wikimedia.org&utm_campaign=api&utm_content=thumbnail"),canonical);
 assert.equal(thumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg?utm_source=commons.wikimedia.org"),"https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg");
 for(const value of [canonical+"?redirect=https://evil.test",canonical+"#hash",canonical.replace("Logo.svg.png","Logo.svg"),canonical.replace("thumb.wikimedia.org","evil.test"),canonical.replace("thumb.wikimedia.org","user@thumb.wikimedia.org"),canonical.replace("thumb.wikimedia.org","thumb.wikimedia.org:444"),"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Logo.svg/330px-Logo.svg.png?utm_source=x&other=y",null,undefined])assert.equal(thumbnailUrl(value),null);
});
