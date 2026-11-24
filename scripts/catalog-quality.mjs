// Measure the actual catalog consumed by the application, not only source links.
import assert from "node:assert/strict";
import {writeFile,readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {currentPlaces,currentCatalog} from "../public/data/current-places.js";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {bundledBrandLogo} from "../public/brands.js";
const report=JSON.parse(await readFile("docs/brand-logo-coverage.json","utf8"));
const rows=Object.values(currentPlaces).flat();
const active=rows.filter(r=>!r[6]||["open","unknown"].includes(r[6]));
const places=cities.flatMap(city=>catalogPlacesForCity(city.id));
const ids=new Set(places.map(p=>p.id));
assert.equal(ids.size,places.length,"Duplicate visible catalog IDs");
assert.equal(places.length,active.length,"Catalog records missing from app");
for(const row of active)assert.ok(ids.has(row[0]),"Missing catalog ID: "+row[0]);
const branded=places.filter(p=>p.brand);
const verified=branded.filter(p=>bundledBrandLogo(p.brand));
const photos=places.filter(p=>p.photo&&!p.photo.brandLogo);
const logos=places.filter(p=>p.photo?.brandLogo);
const descriptions=places.filter(p=>p.description&&p.descriptionSource);
const distinct=new Set(branded.map(p=>p.brand.key));
assert.equal(distinct.size,report.totalBrands);
assert.equal(branded.length,report.brandedPlaces);
assert.equal(verified.length,report.coveredPlaces);
assert.equal(logos.length+photos.length,places.filter(p=>p.photo).length);
const quality={
 revision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),release:currentCatalog.release,
 catalogPlaces:rows.length,visiblePlaces:places.length,citiesWithPlaces:Object.keys(currentPlaces).length,
 recognizedBrands:distinct.size,verifiedBrandLogos:report.verifiedLogos,missingBrandLogos:distinct.size-report.verifiedLogos,
 brandedPlaces:branded.length,placesWithAvailableBrandLogo:verified.length,brandedPlacesWithoutLogo:branded.length-verified.length,
 cardsDisplayingBundledLogo:logos.length,cardsDisplayingBundledPlacePhoto:photos.length,
 cardsWithBundledImage:logos.length+photos.length,cardsWithoutBundledImage:places.length-logos.length-photos.length,
 cardsWithVerifiedDescription:descriptions.length,cardsWithoutVerifiedDescription:places.length-descriptions.length,
 cardsWithOsmPhotoReference:places.filter(p=>p.osmPhotoLink).length,
 cardsWithUnknownOpeningStatus:places.filter(p=>p.status==="unknown").length,
 brandStatusCounts:report.statusCounts,generatedAt:new Date().toISOString()
};
await writeFile("docs/catalog-quality.json",JSON.stringify(quality,null,2)+"\n");
console.log(JSON.stringify(quality));
