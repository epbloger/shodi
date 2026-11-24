import {
  KINDS, MAX_ROUTES, MAX_STOPS, demoBoard, minuteLabel, moveStop,
  newId, readBoard, routeDetails, routeStats, stopDetails,
} from "./routes.js";

const KEY = "weekend-atlas/v1";
const byId = id => document.getElementById(id);
const editor = byId("editor");
const form = byId("edit-form");
const removeDialog = byId("delete-dialog");
const fields = form.elements;
const stopList = byId("stop-list");
const routeList = byId("route-list");
let board = demoBoard();
let editorContext = null;
let storage;

function notice(message) {
  const banner = byId("storage-notice");
  banner.textContent = message;
  banner.hidden = !message;
}

try {
  storage = window.localStorage;
  const saved = storage.getItem(KEY);
  if (saved !== null) board = readBoard(saved);
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
    if (route.id === board.selected) link.setAttribute("aria-current", "true");
    text(link.querySelector(".route-name"), route.name);
    const city = link.querySelector(".route-city");
    text(city, route.city);
    city.hidden = !route.city;
    const { visited } = routeStats(route.stops);
    text(link.querySelector(".route-summary"), visited + "/" + route.stops.length);
    link.addEventListener("click", () => {
      if (board.selected === route.id) return;
      save({ ...board, selected: route.id }, "Открыт маршрут «" + route.name + "».");
      focusRoute(route.id);
    });
    fragment.append(link);
  }
  routeList.replaceChildren(fragment);
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
    kind.querySelector("use").setAttribute("href", "#i-" + (stop.kind === "other" ? "pin" : stop.kind));
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
    fragment.append(item);
  });
  stopList.replaceChildren(fragment);
}

function render() {
  renderRoutes();
  const route = activeRoute();
  byId("active-route").hidden = !route;
  byId("empty-board").hidden = Boolean(route);
  byId("add-route").disabled = board.routes.length >= MAX_ROUTES;
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

byId("delete-item").addEventListener("click", () => {
  const { type, routeId, itemId } = editorContext;
  const noun = type === "route" ? "маршрут" : "остановку";
  const route = board.routes.find(entry => entry.id === routeId);
  const item = type === "route" ? route : route?.stops.find(stop => stop.id === itemId);
  if (!item) return;
  text(byId("delete-title"), "Удалить " + noun + "?");
  text(byId("delete-message"), type === "route"
    ? "«" + item.name + "» будет удалён вместе с остановками."
    : "Остановка «" + item.name + "» будет удалена из маршрута.");
  removeDialog.returnValue = "cancel";
  removeDialog.showModal();
});

byId("delete-form").addEventListener("submit", event => {
  event.preventDefault();
  removeDialog.close(event.submitter.value);
});

removeDialog.addEventListener("close", () => {
  if (removeDialog.returnValue !== "confirm") return;
  const { type, routeId, itemId } = editorContext;
  const route = board.routes.find(entry => entry.id === routeId);
  editor.close();
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
byId("empty-add").addEventListener("click", () => openEditor("route"));
byId("edit-route").addEventListener("click", () => openEditor("route", activeRoute()));
byId("add-stop").addEventListener("click", () => openEditor("stop"));
form.querySelector("[data-dismiss]").addEventListener("click", () => editor.close());
render();
