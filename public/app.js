import {
  KINDS, MAX_ROUTES, MAX_STOPS, emptyBoard, removeUnchangedDemo, minuteLabel, moveStop,
  newId, readBoard, routeDetails, routeStats, stopDetails,
} from "./routes.js";
import { mountGuide } from "./guide-view.js";
import { budgetLabel, cityMatches, mapLink, placeById, PLACE_CATEGORIES, reviewLabel } from "./guide.js";

import { initTheme } from "./theme.js";

const KEY = "weekend-atlas/v1";
initTheme();
const byId = id => document.getElementById(id);
const editor = byId("editor");
const form = byId("edit-form");
const removeDialog = byId("delete-dialog");
const fields = form.elements;
const stopList = byId("stop-list");
const routeList = byId("route-list");
const guideTrigger = byId("guide-trigger");
let board = emptyBoard();
let editorContext = null;
let deleteContext = null;
let storage;
let showingGuide = location.hash !== "#route";
const refreshGuide = mountGuide({
  getRoutes: () => board.routes,
  selectedRoute: () => activeRoute(),
  addPlace: addSuggestedStop,
  openRoute,
});
for (const [kind, name] of Object.entries(KINDS)) {
  fields.kind.add(new Option(name, kind));
}

function showView(guide) {
  showingGuide = guide;
  history.replaceState(null, "", guide ? "#places" : "#route");
}

function notice(message) {
  const banner = byId("storage-notice");
  banner.textContent = message;
  banner.hidden = !message;
}

try {
  storage = window.localStorage;
  const saved = storage.getItem(KEY);
  if (saved !== null) {
    const loaded = readBoard(saved);
    board = removeUnchangedDemo(loaded);
    if (board.routes.length !== loaded.routes.length) storage.setItem(KEY, JSON.stringify(board));
  }
} catch {
  storage = null;
  notice("Сохранённые маршруты недоступны. Изменения действуют до закрытия вкладки.");
}

function activeRoute() {
  return board.routes.find(route => route.id === board.selected);
}

function announce(message) {
  byId("announcement").textContent = message;
}

function save(next, message) {
  board = next;
  if (storage) {
    try {
      storage.setItem(KEY, JSON.stringify(board));
      notice("");
    } catch {
      notice("Браузер не сохранил изменения. Они доступны в этой вкладке.");
    }
  }
  render();
  if (message) announce(message);
}

function replaceRoute(updated, message) {
  save({
    ...board,
    routes: board.routes.map(route => route.id === updated.id ? updated : route),
  }, message);
}

function addSuggestedStop(place, routeId) {
  let route = board.routes.find(entry => entry.id === routeId);
  if (routeId && (!route || !cityMatches(route.city, place.city))) {
    throw new Error("Выберите маршрут для этого города.");
  }
  if (!route && board.routes.length >= MAX_ROUTES) throw new Error("Достигнут лимит маршрутов.");
  if (route?.stops.some(stop => stop.placeId === place.id)) return route.id;
  if (route?.stops.length >= MAX_STOPS) throw new Error("Маршрут уже содержит максимум остановок.");

  const create = !route;
  route ??= { id: newId(), name: place.city + " — прогулка", city: place.city, note: "", stops: [] };
  const detail = place.budget.type === "unknown" ? reviewLabel(place) : budgetLabel(place.budget);
  const note = [place.descriptionLicense || place.descriptionKind === "catalog" ? "" : place.description, detail].filter(Boolean).join("\n");
  const stop = {
    id: newId(), placeId: place.id, visited: false,
    ...stopDetails({ name: place.name, kind: place.kind, note, minutes: 0 }),
  };
  const updated = { ...route, stops: [...route.stops, stop] };
  const routes = create ? [...board.routes, updated] : board.routes.map(item => item.id === route.id ? updated : item);
  save({ ...board, selected: route.id, routes }, "Место добавлено в маршрут.");
  return route.id;
}

function text(element, value) {
  element.textContent = value;
}

function clone(template) {
  return byId(template).content.firstElementChild.cloneNode(true);
}

function renderRoutes() {
  const fragment = document.createDocumentFragment();
  for (const route of board.routes) {
    const link = clone("route-template");
    link.dataset.id = route.id;
    if (!showingGuide && route.id === board.selected) link.setAttribute("aria-current", "true");
    text(link.querySelector(".route-name"), route.name);
    const city = link.querySelector(".route-city");
    text(city, route.city);
    city.hidden = !route.city;
    const { visited } = routeStats(route.stops);
    text(link.querySelector(".route-summary"), visited + "/" + route.stops.length);
    link.addEventListener("click", () => openRoute(route.id));
    fragment.append(link);
  }
  routeList.replaceChildren(fragment);
}

function openRoute(id) {
  const route = board.routes.find(entry => entry.id === id);
  if (!route) return;
  showView(false);
  if (board.selected === id) render();
  else save({ ...board, selected: id }, "Открыт маршрут «" + route.name + "».");
  focusRoute(id);
}

function focusRoute(id) {
  routeList.querySelector('[data-id="' + id + '"]')?.focus();
}

function focusStop(id, selector) {
  const elem = stopList.querySelector('[data-id="' + id + '"]');
  const button = elem?.querySelector(selector);
  if (button?.disabled) elem.querySelector(".edit-stop").focus();
  else button?.focus();
}

function setLabel(element, label) {
  element.setAttribute("aria-label", label);
  element.title = label;
}

function renderStops(route) {
  const fragment = document.createDocumentFragment();
  route.stops.forEach((stop, index) => {
    const item = clone("stop-template");
    item.dataset.id = stop.id;
    item.classList.toggle("is-visited", stop.visited);
    text(item.querySelector(".stop-number"), index + 1);
    text(item.querySelector(".stop-title"), stop.name);
    text(item.querySelector(".stop-detail"),
      KINDS[stop.kind] + (stop.minutes ? " · " + minuteLabel(stop.minutes) : ""));
    const note = item.querySelector(".stop-note");
    text(note, stop.note);
    note.hidden = !stop.note;
    const kind = item.querySelector(".stop-kind");
    kind.dataset.kind = stop.kind;
    const icon = PLACE_CATEGORIES[stop.kind]?.icon ?? (stop.kind === "culture" ? "culture" : "pin");
    kind.querySelector("use").setAttribute("href", "#i-" + icon);
    const place = stop.placeId ? placeById(stop.placeId) : null;
    if (place) {
      const map = item.querySelector(".stop-map");
      map.href = mapLink(place);
      map.hidden = false;
      map.setAttribute("aria-label", place.name + " на карте, откроется в новой вкладке");
    }
    const toggle = item.querySelector(".visit-toggle");
    toggle.checked = stop.visited;
    setLabel(toggle, "Посещено: " + stop.name);
    toggle.addEventListener("change", () => {
      const visited = toggle.checked;
      const stops = route.stops.map(entry => entry.id === stop.id ? { ...stop, visited } : entry);
      replaceRoute({ ...route, stops }, visited ? "Место отмечено как посещённое." : "Отметка снята.");
      focusStop(stop.id, ".visit-toggle");
    });
    for (const [selector, direction, label] of [
      [".move-up", -1, "Переместить вверх"],
      [".move-down", 1, "Переместить вниз"],
    ]) {
      const button = item.querySelector(selector);
      setLabel(button, label + ": " + stop.name);
      button.disabled = index + direction < 0 || index + direction >= route.stops.length;
      button.addEventListener("click", () => {
        replaceRoute({ ...route, stops: moveStop(route.stops, stop.id, direction) }, "Порядок остановок изменён.");
        focusStop(stop.id, selector);
      });
    }
    const edit = item.querySelector(".edit-stop");
    setLabel(edit, "Редактировать: " + stop.name);
    edit.addEventListener("click", () => openEditor("stop", stop));
    const remove = item.querySelector(".remove-stop");
    setLabel(remove, "Удалить остановку: " + stop.name);
    remove.addEventListener("click", () => confirmDelete("stop", route.id, stop.id));
    fragment.append(item);
  });
  stopList.replaceChildren(fragment);
}

function render() {
  renderRoutes();
  const route = activeRoute();
  if (showingGuide) guideTrigger.setAttribute("aria-current", "page");
  else guideTrigger.removeAttribute("aria-current");
  byId("guide-panel").hidden = !showingGuide;
  byId("active-route").hidden = showingGuide || !route;
  byId("empty-board").hidden = showingGuide || Boolean(route);
  byId("add-route").disabled = board.routes.length >= MAX_ROUTES;
  if (showingGuide) {
    refreshGuide();
    return;
  }
  if (!route) {
    stopList.replaceChildren();
    return;
  }
  text(byId("route-title"), route.name);
  text(byId("route-city"), route.city);
  byId("city-line").hidden = !route.city;
  text(byId("route-description"), route.note);
  byId("route-description").hidden = !route.note;
  byId("demo-image").hidden = route.id !== "city-pond";
  const { minutes, visited } = routeStats(route.stops);
  text(byId("stop-count"), route.stops.length);
  text(byId("route-time"), minuteLabel(minutes));
  text(byId("visited-count"), visited + " из " + route.stops.length);
  byId("route-progress").max = Math.max(1, route.stops.length);
  byId("route-progress").value = visited;
  byId("no-stops").hidden = route.stops.length > 0;
  byId("add-stop").disabled = route.stops.length >= MAX_STOPS;
  renderStops(route);
}

function openEditor(type, existing = null) {
  const route = activeRoute();
  if (!existing && ((type === "route" && board.routes.length >= MAX_ROUTES)
                    || (type === "stop" && (!route || route.stops.length >= MAX_STOPS)))) return;
  editorContext = { type, routeId: route?.id, itemId: existing?.id };
  form.reset();
  byId("form-error").hidden = true;
  const editingRoute = type === "route";
  fields.kind.value = "view";
  text(byId("editor-title"), editingRoute
    ? (existing ? "Редактировать маршрут" : "Новый маршрут")
    : (existing ? "Редактировать остановку" : "Новая остановка"));
  byId("city-field").hidden = !editingRoute;
  byId("stop-fields").hidden = editingRoute;
  text(byId("note-label"), editingRoute ? "Описание" : "Заметка");
  byId("delete-item").hidden = !existing;
  if (existing) {
    fields.name.value = existing.name;
    fields.note.value = existing.note;
    if (editingRoute) fields.city.value = existing.city;
    else {
      fields.kind.value = existing.kind;
      fields.minutes.value = existing.minutes;
    }
  }
  editor.showModal();
  fields.name.focus();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const { type, routeId, itemId } = editorContext;
  const route = board.routes.find(entry => entry.id === routeId);
  try {
    const input = {
      name: fields.name.value, note: fields.note.value, city: fields.city.value,
      kind: fields.kind.value, minutes: Number(fields.minutes.value),
    };
    if (type === "route") {
      const details = routeDetails(input);
      if (itemId && !route) throw new Error("Маршрут уже удалён.");
      if (!itemId && board.routes.length >= MAX_ROUTES) throw new Error("Достигнут лимит маршрутов.");
      editor.close();
      if (itemId) replaceRoute({ ...route, ...details }, "Маршрут обновлён.");
      else {
        const created = { id: newId(), ...details, stops: [] };
        showView(false);
        save({ ...board, selected: created.id, routes: [...board.routes, created] }, "Маршрут создан.");
        focusRoute(created.id);
      }
      return;
    }
    const details = stopDetails(input);
    if (!route) throw new Error("Маршрут уже удалён.");
    const previous = route.stops.find(stop => stop.id === itemId);
    if (itemId && !previous) throw new Error("Остановка уже удалена.");
    if (!itemId && route.stops.length >= MAX_STOPS) throw new Error("Достигнут лимит остановок.");
    const stop = previous ? { ...previous, ...details } : { id: newId(), ...details, visited: false };
    editor.close();
    const stops = previous ? route.stops.map(item => item.id === stop.id ? stop : item) : [...route.stops, stop];
    replaceRoute({ ...route, stops }, previous ? "Остановка обновлена." : "Остановка добавлена.");
    focusStop(stop.id, ".edit-stop");
  } catch (error) {
    text(byId("form-error"), error.message);
    byId("form-error").hidden = false;
  }
});

function confirmDelete(type, routeId, itemId = null) {
  const noun = type === "route" ? "маршрут" : "остановку";
  const route = board.routes.find(entry => entry.id === routeId);
  const item = type === "route" ? route : route?.stops.find(stop => stop.id === itemId);
  if (!item) return;
  text(byId("delete-title"), "Удалить " + noun + "?");
  text(byId("delete-message"), type === "route"
    ? "«" + item.name + "» будет удалён вместе с остановками."
    : "Остановка «" + item.name + "» будет удалена из маршрута.");
  deleteContext = { type, routeId, itemId };
  removeDialog.returnValue = "cancel";
  removeDialog.showModal();
}

byId("delete-item").addEventListener("click", () => {
  const { type, routeId, itemId } = editorContext;
  confirmDelete(type, routeId, itemId);
});
byId("remove-route").addEventListener("click", () => {
  const route = activeRoute();
  if (route) confirmDelete("route", route.id);
});

byId("delete-form").addEventListener("submit", event => {
  event.preventDefault();
  removeDialog.close(event.submitter.value);
});

removeDialog.addEventListener("close", () => {
  const pending = deleteContext;
  deleteContext = null;
  if (!pending || removeDialog.returnValue !== "confirm") return;
  const { type, routeId, itemId } = pending;
  const route = board.routes.find(entry => entry.id === routeId);
  if (editor.open) editor.close();
  if (!route) return;
  if (type === "route") {
    const routes = board.routes.filter(entry => entry.id !== routeId);
    const selected = routes[0]?.id ?? null;
    save({ ...board, selected, routes }, "Маршрут удалён.");
    if (selected) focusRoute(selected);
    else byId("empty-add").focus();
  } else {
    replaceRoute({ ...route, stops: route.stops.filter(stop => stop.id !== itemId) }, "Остановка удалена.");
    byId("add-stop").focus();
  }
});

window.addEventListener("storage", event => {
  if (!storage || event.key !== KEY || event.newValue === null) return;
  try {
    board = readBoard(event.newValue);
    render();
  } catch {
    notice("Изменения из другой вкладки не удалось прочитать.");
  }
});

byId("add-route").addEventListener("click", () => openEditor("route"));
guideTrigger.addEventListener("click", () => {
  showView(true);
  render();
});
byId("empty-add").addEventListener("click", () => openEditor("route"));
byId("edit-route").addEventListener("click", () => openEditor("route", activeRoute()));
byId("add-stop").addEventListener("click", () => openEditor("stop"));
form.querySelector("[data-dismiss]").addEventListener("click", () => editor.close());
render();
byId("startup-notice")?.setAttribute("hidden", "");

// Only the bundled Android document can invoke the two native actions.
const androidApp = location.origin === "https://appassets.androidplatform.net";
if (androidApp) {
  document.querySelector(".brand").addEventListener("click", event => { event.preventDefault(); guideTrigger.click(); window.scrollTo(0,0); });
  for (const [id, action] of [["android-about","about"],["android-share","share"]]) {
    const button = byId(id); button.hidden = false;
    button.addEventListener("click", () => { location.href = "https://appassets.androidplatform.net/action/" + action; });
  }
}
const scrollTop = byId("scroll-top");
const updateTop = () => { scrollTop.hidden = window.scrollY < 420; };
window.addEventListener("scroll", updateTop, { passive: true });
scrollTop.addEventListener("click", () => window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"}));
updateTop();
