import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_STOPS, demoBoard, emptyBoard, removeUnchangedDemo, minuteLabel, moveStop, readBoard, routeDetails, routeStats, stopDetails,
} from "../public/routes.js";

const serialized = value => JSON.stringify(value);

test("the demonstration board survives a round trip", () => {
  const board = demoBoard();
  assert.deepEqual(readBoard(serialized(board)), board);
  assert.deepEqual(routeStats(board.routes[0].stops), { minutes: 90, visited: 1 });
});

test("deleting all routes leaves a valid empty board", () => {
  assert.deepEqual(readBoard('{"version":1,"routes":[],"selected":"old"}'), {
    version: 1, routes: [], selected: null,
  });
});

test("route and stop fields reject blanks, invalid categories and invalid durations", () => {
  assert.throws(() => routeDetails({ name: " ", city: "", note: "" }));
  assert.throws(() => routeDetails({ name: "А".repeat(81), city: "", note: "" }));
  for (const minutes of [-1, 721, Infinity, "10", 4.5]) {
    assert.throws(() => stopDetails({ name: "Парк", note: "", kind: "park", minutes }));
  }
  assert.throws(() => stopDetails({ name: "Парк", note: "", kind: "constructor", minutes: 5 }));
  assert.equal(stopDetails({ name: " Парк ", note: "", kind: "park", minutes: 720 }).name, "Парк");
});

test("saved data is limited and must have valid unique identities", () => {
  const board = demoBoard();
  assert.throws(() => readBoard("not JSON"));
  assert.throws(() => readBoard('{"version":2}'));
  board.routes[0].stops.push(board.routes[0].stops[0]);
  assert.throws(() => readBoard(serialized(board)), /Повторяются/);
  board.routes[0].stops = Array.from({ length: MAX_STOPS + 1 }, (_, i) => ({
    ...board.routes[0].stops[0], id: "stop-" + i,
  }));
  assert.throws(() => readBoard(serialized(board)), /Некорректный список/);
  board.routes[0].id = "bad/id";
  assert.throws(() => readBoard(serialized(board)), /Некорректный номер/);
});

test("read records project only the supported data fields", () => {
  const board = demoBoard();
  board.selected = "missing";
  board.routes[0].note = "<b>Заметка</b>";
  board.routes[0].extra = "unused";
  const loaded = readBoard(serialized(board));
  assert.equal(loaded.selected, board.routes[0].id);
  assert.equal(loaded.routes[0].note, "<b>Заметка</b>");
  assert.equal(Object.hasOwn(loaded.routes[0], "extra"), false);
});

test("moveStop keeps all records and leaves invalid moves unchanged", () => {
  const stops = demoBoard().routes[0].stops;
  const reordered = moveStop(stops, "pond", -1);
  assert.deepEqual(reordered.map(stop => stop.id), ["pond", "coffee", "quarter", "view"]);
  assert.deepEqual(stops.map(stop => stop.id), ["coffee", "pond", "quarter", "view"]);
  assert.equal(moveStop(stops, "coffee", -1), stops);
  assert.equal(moveStop(stops, "missing", 1), stops);
});

test("manual stop addresses are optional, bounded, and persist without breaking older saved routes",()=>{
  const board=demoBoard();
  board.routes[0].stops[0].address="  улица Ленина, 1  ";
  const loaded=readBoard(serialized(board));
  assert.equal(loaded.routes[0].stops[0].address,"улица Ленина, 1");
  assert.ok(!Object.hasOwn(loaded.routes[0].stops[1],"address"));
  assert.throws(()=>stopDetails({...board.routes[0].stops[0],address:"a".repeat(241)}));
  assert.ok(!Object.hasOwn(stopDetails({...board.routes[0].stops[0],address:" "}),"address"));
});

test("time labels cover zero, minutes and whole or partial hours", () => {
  assert.equal(minuteLabel(0), "0 мин");
  assert.equal(minuteLabel(20), "20 мин");
  assert.equal(minuteLabel(60), "1 ч");
  assert.equal(minuteLabel(95), "1 ч 35 мин");
});

test("new users start empty and only untouched legacy sample is removed", () => {
  assert.deepEqual(emptyBoard(), { version: 1, selected: null, routes: [] });
  const sample = readBoard(JSON.stringify(demoBoard()));
  assert.deepEqual(removeUnchangedDemo(sample), emptyBoard());
  sample.routes[0].name = "Мой маршрут";
  assert.deepEqual(removeUnchangedDemo(sample), sample);
});
