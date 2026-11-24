import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetLabel, cities, cityByQuery, cityMatches, findPlaces, mapLink, placeById,
  placesForCity, PLACE_CATEGORIES, reviewLabel, catalogPlacesForCity, catalogSource,
} from "../public/guide.js";
import { demoBoard, readBoard, routeDetails, stopDetails } from "../public/routes.js";

test("every curated city has all categories and meaningful place details", () => {
  const unique = new Set();
  for (const city of cities.filter(city => !city.id.startsWith("ru-"))) {
    const places = placesForCity(city.id);
    assert.deepEqual(new Set(places.map(place => place.kind)), new Set(Object.keys(PLACE_CATEGORIES)));
    for (const place of places) {
      assert.equal(place.city, city.name);
      assert.ok(place.description.length > 20 && place.area);
      assert.ok(!unique.has(place.id));
      unique.add(place.id);
      if (place.budget.type !== "free") {
        assert.ok(["ticket", "check"].includes(place.budget.type));
        assert.ok(Number.isFinite(place.budget.low) && place.budget.high > place.budget.low);
      }
      assert.doesNotThrow(() => stopDetails({
        name: place.name, kind: place.kind,
        note: place.description + "\n" + budgetLabel(place.budget), minutes: 0,
      }));
      assert.deepEqual(placeById(place.id), place);
    }
  }
});

test("the national catalog provides valid stops and distinguishes cities with the same name", () => {
  const labels = new Set();
  const venueIds = new Set();
  let covered = 0;
  for (const city of cities) {
    assert.ok(!labels.has(city.label));
    labels.add(city.label);
    assert.equal(cityByQuery(city.label)?.id, city.id);
    assert.doesNotThrow(() => routeDetails({ name: city.label + " — прогулка", city: city.label, note: "" }));
    const places = placesForCity(city.id);
    covered += Number(places.length > 0);
    if (city.id.startsWith("ru-")) assert.ok(places.length <= 10);
    for (const place of places) {
      assert.ok(!venueIds.has(place.id));
      venueIds.add(place.id);
      assert.deepEqual(placeById(place.id), place);
      if (!city.id.startsWith("ru-")) continue;
      assert.ok(place.address && place.description && place.reviews > 0);
      assert.ok(place.rating >= 4 && place.rating <= 5);
      assert.equal(place.budget.type, "unknown");
      assert.doesNotThrow(() => stopDetails({
        name: place.name, kind: place.kind, minutes: 0,
        note: place.description + "\n" + reviewLabel(place),
      }));
      assert.equal(new URL(mapLink(place)).searchParams.get("text"), place.name + " " + place.address);
    }
  }
  assert.ok(cities.length >= 1100);
  assert.ok(covered >= 900);
  assert.ok(venueIds.size >= 5000);
  assert.equal(cityByQuery("Советск"), undefined);
  for (const region of ["Калининградская область", "Кировская область"]) {
    const city = cityByQuery("Советск, " + region);
    assert.ok(placesForCity(city.id).every(place => place.address.includes(region)));
  }
});

test("categories and case-insensitive search can be combined", () => {
  assert.ok(cityMatches(" санкт-петербург ", "Санкт-Петербург"));
  assert.equal(findPlaces({ legacy: true, cityId: "msk", category: "museum" }).length, 2);
  assert.ok(findPlaces({ legacy: true, cityId: "ekb", category: "coffee", query: "КАФЕ" }).length > 0);
  const blackLake = findPlaces({ legacy: true, cityId: "kzn", query: "черное озеро" });
  assert.deepEqual(blackLake.map(place => place.id), ["kzn-black"]);
  assert.equal(findPlaces({ legacy: true, cityId: "not-a-city" }).length, 0);
  assert.equal(findPlaces({ legacy: true, cityId: "msk", query: "кремль паровоз" }).length, 0);
});

test("price types distinguish free entry, tickets and average check", () => {
  assert.equal(budgetLabel({ type: "free" }), "Вход свободный");
  assert.match(budgetLabel({ type: "ticket", low: 300, high: 700 }), /^Билет ≈ 300–700 ₽$/);
  assert.match(budgetLabel({ type: "check", low: 350, high: 900 }), /^Средний чек ≈ 350–900 ₽$/);
  assert.equal(budgetLabel({ type: "unknown" }), "Цена не указана");
  assert.equal(reviewLabel({ rating: 4.8, reviews: 3 }), "4,8 из 5 · 3 отзыва в выборке 2023");
});

test("map links use a fixed origin and encode place names", () => {
  const url = new URL(mapLink({ name: "Тест & парк", city: "Казань" }));
  assert.equal(url.origin, "https://yandex.ru");
  assert.equal(url.pathname, "/maps/");
  assert.equal(url.searchParams.get("text"), "Тест & парк Казань");
});

test("saved routes support catalog categories and older records", () => {
  const board = demoBoard();
  const museum = placeById("ekb-yeltsin");
  board.routes[0].stops.push({
    id: "museum", placeId: museum.id, kind: museum.kind,
    name: museum.name, minutes: 0, note: museum.description, visited: false,
  });
  assert.deepEqual(readBoard(JSON.stringify(board)), board);
  board.routes[0].stops.at(-1).placeId = "bad/id";
  assert.throws(() => readBoard(JSON.stringify(board)), /Некорректный номер/);
});

test("fresh catalog records preserve routes and do not invent reviews or prices", () => {
  const ids = new Set();
  for (const city of cities) {
    const source = catalogSource(city.id);
    if (!source) continue;
    assert.match(source.release, /^2026-/);
    for (const place of catalogPlacesForCity(city.id)) {
      assert.ok(!ids.has(place.id));
      ids.add(place.id);
      assert.ok(Number.isFinite(place.lat) && Number.isFinite(place.lon));
      assert.equal(place.budget.type, "unknown");
      assert.equal(reviewLabel(place), "");
      assert.deepEqual(placeById(place.id), place);
      assert.doesNotThrow(() => stopDetails({ name: place.name, kind: place.kind, note: place.description, minutes: 0 }));
    }
  }
});
