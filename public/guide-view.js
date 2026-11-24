import {
  budgetLabel, cities, cityById, cityByQuery, cityMatches, findPlaces,
  mapLink, PLACE_CATEGORIES, reviewLabel, catalogSource,
} from "./guide.js";

const byId = id => document.getElementById(id);
const countLabel = new Intl.PluralRules("ru");
const PAGE_SIZE = 36;

export function mountGuide({ getRoutes, selectedRoute, addPlace, openRoute }) {
  const cityInput = byId("guide-city");
  const search = byId("guide-search");
  const categories = byId("guide-categories");
  const grid = byId("guide-places");
  const template = byId("place-template");
  const target = byId("guide-target");
  const openButton = byId("open-guide-route");
  const feedback = byId("guide-feedback");
  const cityHelp = byId("city-help");
  const options = byId("city-options");
  let city = cityById("spb");
  let category = "all";
  let selectedTarget;
  let visibleLimit = PAGE_SIZE;
  const more = byId("guide-more");

  const cityChoices = document.createDocumentFragment();
  for (const entry of cities) {
    const option = document.createElement("option");
    option.value = entry.label;
    // Firefox displays the option label instead of its value. The city label
    // already includes the region for duplicate names; use it in both engines.
    option.textContent = entry.label;
    cityChoices.append(option);
  }
  options.append(cityChoices);
  cityInput.value = city.label;

  function updateCategories(allPlaces) {
    const counts = new Map();
    for (const place of allPlaces) counts.set(place.kind, (counts.get(place.kind) ?? 0) + 1);
    for (const button of categories.children) {
      button.setAttribute("aria-pressed", String(button.value === category));
      const count = button.value === "all" ? allPlaces.length : (counts.get(button.value) ?? 0);
      button.textContent = button.dataset.label + " · " + count;
    }
  }

  for (const [kind, label] of [["all", "Все"], ...Object.entries(PLACE_CATEGORIES).map(([key, entry]) => [key, entry.label])]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.dataset.label = label;
    button.textContent = label;
    button.value = kind;
    button.addEventListener("click", () => {
      category = kind;
      visibleLimit = PAGE_SIZE;
      render();
    });
    categories.append(button);
  }

  function render() {
    const places = findPlaces({ cityId: city.id, category, query: search.value });
    const allPlaces = findPlaces({ cityId: city.id, query: search.value });
    const routes = getRoutes().filter(route => cityMatches(route.city, city.label));
    const routeId = selectedTarget ?? selectedRoute()?.id;
    target.replaceChildren(...routes.map(route => new Option(route.name, route.id)), new Option("Создать новый маршрут", ""));
    target.value = routes.some(route => route.id === routeId) ? routeId : (selectedTarget === "" ? "" : routes[0]?.id ?? "");
    openButton.hidden = !target.value;
    const route = routes.find(entry => entry.id === target.value);
    byId("guide-city-name").textContent = city.label;
    const suffix = { one: "место", few: "места", many: "мест" }[countLabel.select(places.length)] ?? "мест";
    byId("guide-count").textContent = places.length + " " + suffix;
    byId("guide-empty").hidden = places.length !== 0;
    const noCatalog = !places.length && !findPlaces({ cityId: city.id }).length;
    more.hidden = places.length <= visibleLimit;
    more.textContent = "Показать ещё " + Math.min(PAGE_SIZE, Math.max(0, places.length - visibleLimit)) + " мест";
    byId("guide-shown").hidden = places.length <= PAGE_SIZE;
    byId("guide-shown").textContent = "Показано " + Math.min(visibleLimit, places.length) + " из " + places.length;
    byId("guide-empty-text").textContent = noCatalog
      ? "В подборке пока нет мест для этого города. Их можно поискать на карте."
      : "Нет мест по этим фильтрам.";
    byId("clear-filters").hidden = noCatalog;
    const cityMap = byId("city-map");
    cityMap.hidden = places.length !== 0;
    const mapQuery = [category === "all" ? "Достопримечательности" : PLACE_CATEGORIES[category].label, search.value.trim()].filter(Boolean).join(" ");
    cityMap.href = mapLink({ name: mapQuery, city: city.label + " " + city.region });
    const source = catalogSource(city.id);
    byId("guide-price-note").textContent = source
      ? "Источник: Overture Maps, выпуск " + source.release + ". Данные не обновляются в реальном времени; статус и часы работы уточняйте на карте."
      : "В свежем каталоге пока нет подтверждённых записей для этого города. Найдите места на карте или добавьте остановку вручную.";
    byId("current-attribution").hidden = !source;
    updateCategories(allPlaces);

    const fragment = document.createDocumentFragment();
    for (const place of places.slice(0, visibleLimit)) {
      const card = template.content.firstElementChild.cloneNode(true);
      const kind = PLACE_CATEGORIES[place.kind];
      card.dataset.category = place.kind;
      card.dataset.placeId = place.id;
      card.querySelector(".place-icon use").setAttribute("href", "#i-" + kind.icon);
      card.querySelector(".place-category").textContent = kind.name;
      card.querySelector(".place-name").textContent = place.name;
      card.querySelector(".place-area").textContent = place.area;
      const rating = card.querySelector(".place-rating");
      rating.textContent = place.status === "open" ? "Действует по данным источника" : "Статус уточните на карте";
      rating.hidden = false;
      const description = card.querySelector(".place-description");
      description.textContent = place.description;
      description.hidden = !place.description || place.description === kind.name;
      const budget = card.querySelector(".place-budget");
      budget.hidden = place.budget.type === "unknown";
      budget.textContent = budget.hidden ? "" : budgetLabel(place.budget);
      const map = card.querySelector(".place-map");
      map.href = mapLink(place);
      map.setAttribute("aria-label", place.name + " на карте, откроется в новой вкладке");
      const add = card.querySelector(".place-add");
      if (route?.stops.some(stop => stop.placeId === place.id)) {
        add.disabled = true;
        add.querySelector("span").textContent = "В маршруте";
        add.querySelector("svg").hidden = true;
      } else {
        add.setAttribute("aria-label", "Добавить в маршрут: " + place.name);
        add.addEventListener("click", () => {
          try {
            selectedTarget = addPlace(place, target.value);
            render();
            showFeedback("«" + place.name + "» добавлено в маршрут.");
            grid.querySelector('[data-place-id="' + place.id + '"] .place-map')?.focus({ preventScroll: true });
          } catch (error) {
            showFeedback(error.message, true);
          }
        });
      }
      fragment.append(card);
    }
    grid.replaceChildren(fragment);
  }

  function showFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("guide-error", error);
  }

  function resetSearch() {
    category = "all";
    visibleLimit = PAGE_SIZE;
    search.value = "";
    showFeedback("");
    render();
  }

  function chooseCity(reportUnknown = false) {
    const chosen = cityByQuery(cityInput.value);
    if (!chosen) {
      cityHelp.textContent = "Выберите город из подсказок. Для городов с одинаковым названием указан регион.";
      cityHelp.hidden = !reportUnknown;
      return;
    }
    cityHelp.hidden = true;
    if (chosen.id === city.id) return;
    city = chosen;
    selectedTarget = undefined;
    resetSearch();
  }

  cityInput.addEventListener("input", () => chooseCity());
  cityInput.addEventListener("change", () => {
    chooseCity(true);
    if (cityHelp.hidden) cityInput.value = city.label;
  });
  cityInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.isComposing) chooseCity(true);
  });
  target.addEventListener("change", () => {
    selectedTarget = target.value;
    showFeedback("");
    render();
  });
  openButton.addEventListener("click", () => openRoute(target.value));
  search.addEventListener("input", () => { visibleLimit = PAGE_SIZE; render(); });
  more.addEventListener("click", () => {
    const firstNew = visibleLimit;
    visibleLimit += PAGE_SIZE;
    render();
    grid.children[firstNew]?.querySelector(".place-map")?.focus();
  });
  byId("clear-filters").addEventListener("click", () => {
    resetSearch();
    search.focus();
  });
  return render;
}
