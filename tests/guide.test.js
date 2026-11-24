import assert from "node:assert/strict";
import test from "node:test";
import { budgetLabel, cities, cityMatches, findPlaces, mapLink, placeById, placesForCity, PLACE_CATEGORIES } from "../public/guide.js";
import { demoBoard, readBoard, stopDetails } from "../public/routes.js";

test("every city has all categories and meaningful place details", () => {
  const unique = new Set();
  for (const city of cities) {
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

test("categories and case-insensitive search can be combined", () => {
  assert.ok(cityMatches(" санкт-петербург ", "Санкт-Петербург"));
  assert.equal(findPlaces({ cityId: "msk", category: "museum" }).length, 2);
  assert.ok(findPlaces({ cityId: "ekb", category: "coffee", query: "КАФЕ" }).length > 0);
  const blackLake = findPlaces({ cityId: "kzn", query: "черное озеро" });
  assert.deepEqual(blackLake.map(place => place.id), ["kzn-black"]);
  assert.equal(findPlaces({ cityId: "not-a-city" }).length, 0);
  assert.equal(findPlaces({ cityId: "msk", query: "кремль паровоз" }).length, 0);
});

test("price types distinguish free entry, tickets and average check", () => {
  assert.equal(budgetLabel({ type: "free" }), "Вход свободный");
  assert.match(budgetLabel({ type: "ticket", low: 300, high: 700 }), /^Билет ≈ 300–700 ₽$/);
  assert.match(budgetLabel({ type: "check", low: 350, high: 900 }), /^Средний чек ≈ 350–900 ₽$/);
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
