import test from "node:test";
import assert from "node:assert/strict";
import {validatePhoto,photoForItem} from "../public/photos.js";
const valid={data:"data:image/jpeg;base64,/9j/",title:"File:Example.jpg",author:"Example author",license:"CC BY 4.0",licenseUrl:"https://creativecommons.org/licenses/by/4.0/",source:"https://commons.wikimedia.org/wiki/File:Example.jpg"};
test("photo metadata must identify a permitted licence and source",()=>{
  assert.ok(validatePhoto(valid));
  for(const change of [{data:"data:image/svg+xml;base64,AAAA"},{source:"https://example.com/a"},{license:"CC BY-NC 4.0"},{author:""},{licenseUrl:"https://example.com"}])assert.equal(validatePhoto({...valid,...change}),false);
  assert.equal(photoForItem("__proto__"),null);
});
