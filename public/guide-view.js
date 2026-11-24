import { budgetLabel, cities, findPlaces, mapLink, PLACE_CATEGORIES } from "./guide.js";

const byId = id => document.getElementById(id);
const countLabel = new Intl.PluralRules("ru");

export function mountGuide() {
  const citySelect = byId("guide-city");
  const search = byId("guide-search");
  const categories = byId("guide-categories");
  const grid = byId("guide-places");
  const template = byId("place-template");
  let category = "all";

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
      card.querySelector(".place-icon use").setAttribute("href", "#i-" + kind.icon);
      card.querySelector(".place-category").textContent = kind.name;
      card.querySelector(".place-name").textContent = place.name;
      card.querySelector(".place-area").textContent = place.area;
      card.querySelector(".place-description").textContent = place.description;
      card.querySelector(".place-budget").textContent = budgetLabel(place.budget);
      const map = card.querySelector(".place-map");
      map.href = mapLink(place);
      map.setAttribute("aria-label", place.name + " на карте, откроется в новой вкладке");
      fragment.append(card);
    }
    grid.replaceChildren(fragment);
  }

  citySelect.addEventListener("change", () => {
    category = "all";
    search.value = "";
    render();
  });
  search.addEventListener("input", render);
  byId("clear-filters").addEventListener("click", () => {
    category = "all";
    search.value = "";
    render();
    search.focus();
  });
  render();
}
