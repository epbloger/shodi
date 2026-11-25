// Bind the offline catalog used by the APK to exact Git blobs, including all
// independently validated enrichment manifests. Git's normal text filters
// make this check consistent on Windows and Linux.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";

const paths=[
  "docs/brand-article-coverage.json", "docs/brand-coverage.json", "docs/brand-logo-coverage.json",
  "docs/current-catalog.json", "docs/photo-coverage.json", "docs/priority-wiki-report.json", "docs/release-priority-scope.json",
  "docs/voyage-photo-coverage.json", "docs/wiki-summary-coverage.json", "public/assets/city-guide.webp",
  "public/data/brand-articles.js", "public/data/brand-logos.js", "public/data/current-places.js",
  "public/data/place-brands.js", "public/data/place-photos.js", "public/data/place-taxonomy.js",
  "public/data/voyage-photos.js", "public/data/wiki-summaries.js",
  "public/data/archive-context.js", "public/data/cities.js", "public/data/imported-descriptions.js",
  "public/data/osm-photo-links.js", "public/data/osm-place-facts.js", "public/data/place-descriptions.js",
  "public/data/places.js", "public/data/voyage-places.js", "public/catalog-corrections.js", "public/editorial-guide.js",
];
const manifest="docs/release-catalog-blobs.txt";
const git=(...args)=>execFileSync("git",args,{encoding:"utf8"}).trim();
const actual=paths.map(path=>`${git("hash-object",`--path=${path}`,path)}  ${path}`).join("\n")+"\n";
if(process.argv.includes("--record")){
  writeFileSync(manifest,actual);
  console.log(`Recorded ${paths.length} catalog blobs`);
}else{
  assert.equal(readFileSync(manifest,"utf8").replaceAll("\r\n","\n"),actual,"Release catalog differs from the recorded snapshot");
  console.log(`Verified ${paths.length} catalog blobs`);
}
