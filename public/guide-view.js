import { budgetLabel, cities, cityMatches, findPlaces, mapLink, PLACE_CATEGORIES } from "./guide.js";

const byId = id => document.getElementById(id);
const countLabel = new Intl.PluralRules("ru");

export function mountGuide({ getRoutes, selectedRoute, addPlace, openRoute }) {
  const citySelect = byId("guide-city");
  const search = byId("guide-search");
  const categories = byId("guide-categories");
  const grid = byId("guide-places");
  const template = byId("place-template");
  const target = byId("guide-target");
  const openButton = byId("open-guide-route");
  const feedback = byId("guide-feedback");
  let category = "all";
  let selectedTarget;

  for (const city of cities) {
    citySelect.add(new Option(city.name, city.id));
  }

  function updateCategories() {
    for (const button of categories.children) {
      button.setAttribute("aria-pressed", String(button.value === category));
    }
  }

  for (const [kind, label] of [["all", "Все"], ...Object.entries(PLACE_CATEGORIES).map(([key, entry]) => [key, entry.label])]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.textContent = label;
    button.value = kind;
    button.addEventListener("click", () => {
      category = kind;
      render();
    });
    categories.append(button);
  }

  function render() {
    const city = cities.find(entry => entry.id === citySelect.value);
    const places = findPlaces({ cityId: city?.id, category, query: search.value });
    const routes = getRoutes().filter(route => city && cityMatches(route.city, city.name));
    const routeId = selectedTarget ?? selectedRoute()?.id;
    target.replaceChildren(...routes.map(route => new Option(route.name, route.id)), new Option("Создать новый маршрут", ""));
    target.value = routes.some(route => route.id === routeId) ? routeId : (selectedTarget === "" ? "" : routes[0]?.id ?? "");
    openButton.hidden = !target.value;
    const route = routes.find(entry => entry.id === target.value);
    byId("guide-city-name").textContent = city?.name ?? "";
    const suffix = { one: "место", few: "места", many: "мест" }[countLabel.select(places.length)] ?? "мест";
    byId("guide-count").textContent = places.length + " " + suffix;
    byId("guide-empty").hidden = places.length !== 0;
    updateCategories();

    const fragment = document.createDocumentFragment();
    for (const place of places) {
      const card = template.content.firstElementChild.cloneNode(true);
      const kind = PLACE_CATEGORIES[place.kind];
      card.dataset.category = place.kind;
      card.dataset.placeId = place.id;
      card.querySelector(".place-icon use").setAttribute("href", "#i-" + kind.icon);
      card.querySelector(".place-category").textContent = kind.name;
      card.querySelector(".place-name").textContent = place.name;
      card.querySelector(".place-area").textContent = place.area;
      card.querySelector(".place-description").textContent = place.description;
      card.querySelector(".place-budget").textContent = budgetLabel(place.budget);
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
    search.value = "";
    showFeedback("");
    render();
  }

  citySelect.addEventListener("change", () => {
    selectedTarget = undefined;
    resetSearch();
  });
  target.addEventListener("change", () => {
    selectedTarget = target.value;
    showFeedback("");
    render();
  });
  openButton.addEventListener("click", () => openRoute(target.value));
  search.addEventListener("input", render);
  byId("clear-filters").addEventListener("click", () => {
    resetSearch();
    search.focus();
  });
  return render;
}
