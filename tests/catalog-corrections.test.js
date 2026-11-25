import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { currentCatalog, currentPlaces } from "../public/data/current-places.js";
import { russianCities } from "../public/data/cities.js";
import { catalogCorrections, effectiveRow, effectiveCity, effectiveRowsForCity, effectivePhotoIdentity } from "../public/catalog-corrections.js";

const scope = JSON.parse(readFileSync(new URL("../docs/release-priority-scope.json", import.meta.url), "utf8"));
const rawRows = Object.values(currentPlaces).flat();
const rawById = new Map(rawRows.map(row => [row[0], row]));

test("verified corrections match the frozen cultural scope and raw records", () => {
  assert.equal(scope.cultural.length, 652);
  assert.equal(scope.brands.length, 67);
  assert.equal(catalogCorrections.length, 9);
  const candidates = new Map(scope.cultural.map(row => [row.id, row]));
  for (const entry of catalogCorrections) {
    const raw = rawById.get(entry.id);
    assert.deepEqual(raw.slice(1, 6), entry.before);
    assert.ok(currentPlaces[entry.cityId].includes(raw));
    assert.ok(russianCities.some(city => city[0] === entry.cityId));
    const candidate = candidates.get(entry.id);
    if(candidate)assert.deepEqual([candidate.name, candidate.kind, candidate.lat, candidate.lon], [raw[1], raw[2], raw[4], raw[5]]);
    else assert.equal(entry.id,"spb-o20250f8ba7e2");
    assert.ok(entry.sources.every(source => new URL(source).protocol === "https:"));
    const copy = [...raw];
    const effective = effectiveRow(raw);
    assert.notEqual(effective, raw);
    assert.deepEqual(raw, copy);
    assert.equal(effective[0], raw[0]);
    assert.equal(effective[6], raw[6]);
    assert.equal(effectiveCity(entry.cityId, raw), entry.cityId);
    assert.equal(effectiveRow(effective), effective);
  }
});

test("corrected coordinates, address and category are suitable for the displayed card", () => {
  assert.deepEqual(effectiveRow(rawById.get("kzn-o5ff02a5244f4")).slice(4, 6), [55.799453, 49.106460]);
  const museum = effectiveRow(rawById.get("kzn-ob595a5d2fd62"));
  assert.match(museum[3], /Казанский Кремль/);
  assert.deepEqual(museum.slice(4, 6), [55.8008, 49.1050]);
  assert.deepEqual(effectiveRow(rawById.get("ru-7eeb876e7b67-oc8dcf150d8dd")).slice(4, 6), [55.114463, 37.647121]);
  assert.equal(effectiveRow(rawById.get("nn-o9c0838acd24a"))[2], "architecture");
  assert.equal(effectiveRow(rawById.get("spb-o20250f8ba7e2"))[2], "coffee");
  assert.match(effectiveRow(rawById.get("kzn-oeb16ffdc1b10"))[3], /Петербургская/);
  assert.match(effectiveRow(rawById.get("msk-o20dba94845a0"))[3], /павильон 13/);
  assert.match(effectiveRow(rawById.get("msk-o86e7cab7c588"))[3], /стр\. 9/);
});

test("effective city lists preserve all 55,716 IDs and uncertain identities", () => {
  const corrected = Object.keys(currentPlaces).flatMap(city => effectiveRowsForCity(currentPlaces, city));
  assert.equal(corrected.length, 55716);
  assert.equal(corrected.length, currentCatalog.places);
  assert.deepEqual(corrected.map(row => row[0]), rawRows.map(row => row[0]));
  assert.equal(new Set(corrected.map(row => row[0])).size, 55716);
  assert.equal(corrected.filter((row, i) => row !== rawRows[i]).length, catalogCorrections.length);
  for (const id of ["msk-o811e48c4faed", "msk-o77954ba465bf", "msk-o987751770e91", "nn-ocd23d6ac31db"]) {
    const raw = rawById.get(id);
    assert.ok(raw);
    assert.equal(effectiveRow(raw), raw);
  }
  assert.deepEqual(effectiveRowsForCity(currentPlaces, "missing-city"), []);
});

test("changed snapshot identity does not receive stale overrides", () => {
  const raw = [...rawById.get("kzn-o5ff02a5244f4")];
  raw[4] += 0.001;
  assert.equal(effectiveRow(raw), raw);
  assert.equal(effectiveCity("new-city", raw), "new-city");
});

test("verified photo identities apply only to the exact corrected location",()=>{
  const row=rawById.get("kzn-o5ff02a5244f4");
  assert.equal(effectivePhotoIdentity(row),null);
  const corrected=effectiveRow(row);
  assert.equal(effectivePhotoIdentity(corrected).qid,"Q603622");
  assert.equal(effectivePhotoIdentity([...corrected.slice(0,4),0,0]),null);
  assert.equal(effectivePhotoIdentity(effectiveRow(rawById.get("nn-o9c0838acd24a"))).qid,"Q2371326");
  assert.equal(effectivePhotoIdentity(effectiveRow(rawById.get("ru-7eeb876e7b67-oc8dcf150d8dd"))).qid,"Q564901");
  assert.equal(effectivePhotoIdentity(effectiveRow(rawById.get("msk-o20dba94845a0"))).qid,"Q48948839");
});
