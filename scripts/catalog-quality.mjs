// Measure the actual catalog consumed by the application, not only source links.
import assert from "node:assert/strict";
import {writeFile,readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {currentPlaces,currentCatalog} from "../public/data/current-places.js";
import {cities,catalogPlacesForCity} from "../public/guide.js";
import {bundledBrandLogo} from "../public/brands.js";
import {hasSpecificType} from "../public/catalog-summary.js";
import {hasUsefulDescription,priorityForEnrichment} from "../public/catalog-presentation.js";
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
const descriptions=places.filter(p=>p.description&&p.descriptionSource&&["wikidata","wikipedia-place","editorial-place","osm-facts","wikivoyage-place"].includes(p.descriptionKind));
const brandDescriptions=places.filter(p=>p.description&&["wikipedia-brand","editorial-brand"].includes(p.descriptionKind));
const archive=places.filter(p=>p.description&&p.descriptionKind==="archive-context");
const summaries=places.filter(p=>p.description&&p.descriptionKind==="catalog");
assert.equal(descriptions.length+brandDescriptions.length+archive.length+summaries.length,places.length,"Every place must have a factual description or labeled catalog summary");
const distinct=new Set(branded.map(p=>p.brand.key));
assert.equal(distinct.size,report.totalBrands);
assert.equal(branded.length,report.brandedPlaces);
assert.equal(verified.length,report.coveredPlaces);
assert.equal(logos.length+photos.length,places.filter(p=>p.photo).length);
const priority=places.filter(p=>priorityForEnrichment(p)!=="optional");
const brandGroups=new Map();
for(const p of branded){const r=brandGroups.get(p.brand.key)||{key:p.brand.key,name:p.brand.name,branches:0,withDescription:0};r.branches++;if(hasUsefulDescription(p))r.withDescription++;brandGroups.set(p.brand.key,r);}
const missingBrands=[...brandGroups.values()].filter(r=>r.withDescription<r.branches).sort((a,b)=>(b.branches-b.withDescription)-(a.branches-a.withDescription));
await writeFile("docs/priority-content-backlog.json",JSON.stringify({brands:missingBrands,cultural:priority.filter(p=>!p.brand&&!hasUsefulDescription(p)).map(p=>({id:p.id,name:p.name,city:p.city,kind:p.kind,lat:p.lat,lon:p.lon}))},null,2)+"\n");
const quality={
 revision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),release:currentCatalog.release,
 catalogPlaces:rows.length,visiblePlaces:places.length,citiesWithPlaces:Object.keys(currentPlaces).length,
 recognizedBrands:distinct.size,verifiedBrandLogos:report.verifiedLogos,missingBrandLogos:distinct.size-report.verifiedLogos,
 brandedPlaces:branded.length,placesWithAvailableBrandLogo:verified.length,brandedPlacesWithoutLogo:branded.length-verified.length,
 cardsDisplayingBundledLogo:logos.length,cardsDisplayingBundledPlacePhoto:photos.length,
 cardsWithBundledImage:logos.length+photos.length,cardsWithoutBundledImage:places.length-logos.length-photos.length,
 cardsWithVerifiedDescription:descriptions.length,cardsWithWikivoyageDescription:descriptions.filter(p=>p.descriptionKind==="wikivoyage-place").length,cardsWithOsmFactDescription:descriptions.filter(p=>p.descriptionKind==="osm-facts").length,cardsWithArchiveContext:archive.length,cardsWithCatalogSummary:summaries.length,cardsWithNearbyContext:places.filter(p=>p.nearbyContext).length,cardsWithContextInBasicDescription:summaries.filter(p=>p.nearbyContext&&p.description.includes(p.nearbyContext)).length,cardsWithSpecificCategorySummary:summaries.filter(p=>hasSpecificType(p.id,p.kind)).length,cardsWithWikipediaPlaceDescription:descriptions.filter(p=>p.descriptionKind==="wikipedia-place").length,cardsWithWikipediaBrandDescription:brandDescriptions.filter(p=>p.descriptionKind==="wikipedia-brand").length,cardsWithEditorialPlaceDescription:descriptions.filter(p=>p.descriptionKind==="editorial-place").length,cardsWithEditorialBrandDescription:brandDescriptions.filter(p=>p.descriptionKind==="editorial-brand").length,cardsWithAnyDescription:descriptions.length+brandDescriptions.length+archive.length+summaries.length,cardsWithoutAnyDescription:places.length-descriptions.length-brandDescriptions.length-archive.length-summaries.length,cardsWithoutVerifiedDescription:places.length-descriptions.length,
 cardsShowingUsefulDescription:places.filter(hasUsefulDescription).length,cardsWithMapOnlyDescription:places.filter(p=>!hasUsefulDescription(p)).length,priorityCards:priority.length,priorityCardsWithoutUsefulDescription:priority.filter(p=>!hasUsefulDescription(p)).length,optionalCardsWithoutUsefulDescription:places.filter(p=>priorityForEnrichment(p)==="optional"&&!hasUsefulDescription(p)).length,brandsWithIncompleteDescription:missingBrands.length,
 cardsWithOsmPhotoReference:places.filter(p=>p.osmPhotoLink).length,
 cardsWithUnknownOpeningStatus:places.filter(p=>p.status==="unknown").length,
 brandStatusCounts:report.statusCounts,generatedAt:new Date().toISOString()
};
await writeFile("docs/catalog-quality.json",JSON.stringify(quality,null,2)+"\n");
console.log(JSON.stringify(quality));
