import test from "node:test";
import assert from "node:assert/strict";
import {kartaThumbnail,kartaCandidates,kartaRecord,validKartaPhoto} from "../public/kartaview-photos.js";
const place={lat:55.75,lon:37.62};
const url="https://storage13.openstreetcam.org/files/photo/2022/10/6/lth/123_ab.jpg";
const row={lat:"55.7501",lng:"37.62",visibility:"public",status:"active",autoImgProcessingStatus:"FINISHED",autoImgProcessingResult:"BLURRED",sequenceId:"123",fileurlLTh:url,storage:"storage13",shotDate:"2022-10-06 12:00:00"};
test("only public blurred KartaView thumbnails at the requested location",()=>{
 const result=kartaCandidates(place,[row,{...row,visibility:"private"},{...row,autoImgProcessingResult:"UNBLURRED"},{...row,lat:"56"},{...row,fileurlLTh:"https://evil.test/abc.jpg"}]);
 assert.equal(result.length,1);assert.equal(result[0].meters,11);
 const photo=kartaRecord(result[0],"data:image/jpeg;base64,/9j/");
 assert.equal(validKartaPhoto(photo),true);
 assert.equal(validKartaPhoto({...photo,nearby:false}),false);
 assert.equal(validKartaPhoto({...photo,source:"https://evil.test/abc.jpg"}),false);
});
test("KartaView rejects untrusted hosts, originals and query strings",()=>{
 assert.equal(kartaThumbnail(url),url);
 assert.equal(kartaThumbnail(url,"storage9"),url.replace("storage13","storage9"));
 assert.equal(kartaThumbnail("storage13/files/photo/2022/10/6/lth/123_ab.jpg"),url);
 for(const bad of [url+"?x=1",url.replace("/lth/","/proc/"),url.replace("https:","http:"),url.replace("openstreetcam.org","openstreetcam.org.evil.test")])assert.equal(kartaThumbnail(bad),null);
});
