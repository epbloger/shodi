import { PLACE_CATEGORIES } from "./guide.js";

export const MAX_ROUTES = 30;
export const MAX_STOPS = 32;

export const KINDS = Object.freeze({
  ...Object.fromEntries(Object.entries(PLACE_CATEGORIES).map(([kind, category]) => [kind, category.name])),
  view: "Вид",
  park: "Парк",
  culture: "Культура",
  coffee: "Кофе",
  other: "Другое",
});

export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function text(value, limit, required = false) {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) {
    throw new Error(required ? "Введите название." : "Сократите текст в поле.");
  }
  return value.trim();
}

function id(value) {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,48}$/.test(value)) {
    throw new Error("Некорректный номер записи.");
  }
  return value;
}

export function routeDetails(fields) {
  return {
    name: text(fields.name, 80, true),
    city: text(fields.city, 60),
    note: text(fields.note, 400),
  };
}

export function stopDetails(fields) {
  const { kind, minutes } = fields;
  if (typeof kind !== "string" || !Object.hasOwn(KINDS, kind)) {
    throw new Error("Выберите категорию.");
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720) {
    throw new Error("Укажите от 0 до 720 минут.");
  }
  const address = text(fields.address ?? "", 240);
  return { name: text(fields.name, 80, true), note: text(fields.note, 400), kind, minutes, ...(address ? { address } : {}) };
}

function records(items, maximum, parse) {
  if (!Array.isArray(items) || items.length > maximum) {
    throw new Error("Некорректный список.");
  }
  const result = items.map(parse);
  if (new Set(result.map(item => item.id)).size !== result.length) {
    throw new Error("Повторяются номера записей.");
  }
  return result;
}

export function readBoard(raw) {
  if (typeof raw !== "string" || raw.length > 1_200_000) {
    throw new Error("Файл данных слишком большой.");
  }
  const data = JSON.parse(raw);
  if (data?.version !== 1) {
    throw new Error("Неизвестный формат маршрутов.");
  }
  const routes = records(data.routes, MAX_ROUTES, route => ({
    id: id(route.id),
    ...routeDetails(route),
    stops: records(route.stops, MAX_STOPS, stop => {
      if (typeof stop.visited !== "boolean") throw new Error("Некорректная отметка посещения.");
      return {
        id: id(stop.id), ...stopDetails(stop), visited: stop.visited,
        ...(stop.placeId === undefined ? {} : { placeId: id(stop.placeId) }),
      };
    }),
  }));
  const selected = routes.some(route => route.id === data.selected) ? data.selected : routes[0]?.id ?? null;
  return { version: 1, selected, routes };
}

export function moveStop(stops, stopId, direction) {
  const index = stops.findIndex(stop => stop.id === stopId);
  const target = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || target < 0 || target >= stops.length) return stops;
  const reordered = [...stops];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}

export function routeStats(stops) {
  return stops.reduce((result, stop) => {
    result.minutes += stop.minutes;
    result.visited += Number(stop.visited);
    return result;
  }, { minutes: 0, visited: 0 });
}

export function minuteLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? hours + " ч" : "", rest || !hours ? rest + " мин" : ""].filter(Boolean).join(" ");
}

export function demoBoard() {
  return {
    version: 1,
    selected: "city-pond",
    routes: [{
      id: "city-pond",
      name: "Суббота у воды",
      city: "Екатеринбург",
      note: "Кофе, тихий сквер и прогулка по набережной Исети.",
      stops: [
        { id: "coffee", name: "Кофе у Плотинки", kind: "coffee", minutes: 15, note: "", visited: true },
        { id: "pond", name: "Исторический сквер", kind: "park", minutes: 25, note: "", visited: false },
        { id: "quarter", name: "Литературный квартал", kind: "culture", minutes: 30, note: "", visited: false },
        { id: "view", name: "Набережная Исети", kind: "view", minutes: 20, note: "", visited: false },
      ],
    }],
  };
}

export function emptyBoard() {
  return { version: 1, selected: null, routes: [] };
}

// Remove the untouched sample only. Preserve any route the user edited.
export function removeUnchangedDemo(board) {
  const sample = readBoard(JSON.stringify(demoBoard())).routes[0];
  const routes = board.routes.filter(route => JSON.stringify(route) !== JSON.stringify(sample));
  return { ...board, routes, selected: routes.some(route => route.id === board.selected) ? board.selected : routes[0]?.id ?? null };
}
