import test from "node:test";
import assert from "node:assert/strict";
import {photoBytes,PHOTO_LIMIT,PHOTO_BYTES_LIMIT} from "../scripts/photo-import-policy.mjs";
test("offline photo budget uses raster payload bytes and rejects false signatures",()=>{
 const data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=";
 assert.equal(photoBytes({data}),Buffer.from(data.split(",")[1],"base64").length);
 assert.equal(photoBytes({data:"data:image/png;base64,AAAA"}),0);
 assert.equal(photoBytes({data:"data:image/svg+xml;base64,AAAA"}),0);
 assert.equal(photoBytes({data:data.replace("image/png","image/jpeg")}),0);
 assert.equal(photoBytes(null),0);
 assert.ok(PHOTO_LIMIT>100&&PHOTO_BYTES_LIMIT>5_000_000);
});
