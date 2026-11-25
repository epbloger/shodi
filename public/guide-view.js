import {loadPlacePhoto} from "./online-photos.js";
import {hasUsefulDescription,shouldLookupPhoto} from "./catalog-presentation.js";
import {
  budgetLabel, cities, cityById, cityByQuery, cityMatches, findPlaces,
  mapLink, PLACE_CATEGORIES, reviewLabel, catalogSource,
} from "./guide.js";

const byId = id => document.getElementById(id);
const countLabel = new Intl.PluralRules("ru");
const mobile = window.matchMedia("(max-width: 760px)");
const pageSize = () => mobile.matches ? 10 : 36;

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
  let visibleLimit = pageSize();
  const more = byId("guide-more");
  let photoObserver;
  let photoRenderVersion = 0;
  const photoTasks = new Map();

  const cityChoices = document.createDocumentFragment();
  for (const entry of cities) {
    const option = document.createElement("option");
    option.value = entry.label;
    // Firefox displays the label; keep the city name visible in every engine.
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
      visibleLimit = pageSize();
      render();
    });
    categories.append(button);
  }

  function render(append = false) {
    if(!append){
      photoObserver?.disconnect();
      photoObserver = undefined;
      photoTasks.clear();
      photoRenderVersion++;
    }
    const photoVersion = photoRenderVersion;
    if(!photoObserver && location.origin === "https://appassets.androidplatform.net") {
      photoObserver = new IntersectionObserver(entries => {
        for(const entry of entries) {
          if(!entry.isIntersecting)continue;
          photoObserver.unobserve(entry.target);
          const task=photoTasks.get(entry.target);photoTasks.delete(entry.target);
          task?.();
        }
      },{rootMargin:"100px"});
    }
    const allPlaces = findPlaces({ cityId: city.id, query: search.value });
    const places = category === "all" ? allPlaces : allPlaces.filter(place => place.kind === category);
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
    more.textContent = "Показать ещё " + Math.min(pageSize(), Math.max(0, places.length - visibleLimit)) + " мест";
    byId("guide-shown").hidden = places.length <= pageSize();
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
    for (const place of places.slice(append ? grid.children.length : 0, visibleLimit)) {
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
      const showDescription=hasUsefulDescription(place);
      description.textContent = showDescription ? place.description : "";
      description.hidden = !showDescription;
      if (showDescription) {
        const source = document.createElement("a");
        source.className = "description-source";
        source.href = place.descriptionSource;
        source.target = "_blank"; source.rel = "noopener noreferrer";
        source.textContent = place.descriptionKind==="wikivoyage-place" ? "Викигид · "+place.descriptionTitle+" (сокращено)" : place.descriptionKind?.startsWith("wikipedia") ? "Википедия · "+place.descriptionTitle+" (сокращено)" : place.descriptionTitle ?? "Источник описания";
        description.append(document.createElement("br"), source);
        if(place.descriptionLicense){const a=document.createElement("a");a.href=place.descriptionLicense;a.className="description-source";a.target="_blank";a.rel="noopener noreferrer";a.textContent="CC BY-SA 4.0";description.append(" · ",a);}
      }
      const cover = card.querySelector(".place-cover");
      cover.hidden = true;
      cover.querySelector("use").setAttribute("href","#i-"+kind.icon);
      cover.querySelector("span").textContent=kind.name;
      if(place.brand){cover.querySelector("span").textContent=place.brand.name;cover.querySelector("small").textContent="Бренд · фото пока нет";}
      const renderPhoto = photo => {
        const figure = card.querySelector(".place-photo");
        const image = figure.querySelector("img");
        const caption = figure.querySelector("figcaption");
        const link = (url, text) => {
          const a = document.createElement("a"); a.href=url; a.textContent=text;
          a.target="_blank"; a.rel="noopener noreferrer"; return a;
        };
        figure.classList.toggle("place-brand-logo",photo.brandLogo===true);
        image.alt = photo.brandLogo===true ? "Логотип "+photo.brandName : photo.nearby === true ? "Окрестности: "+place.name : place.name;
        image.addEventListener("error", () => { figure.hidden = true; cover.hidden = true; }, {once:true});
        caption.replaceChildren(link(photo.source,photo.provider==="kartaview"?photo.author:photo.author+" · Wikimedia Commons")," · ",link(photo.licenseUrl,photo.license)," · уменьшенная копия");
        if(photo.provider==="kartaview"){
          caption.append(" · ",link(photo.sequenceUrl,"KartaView"));
          if(photo.captureDate)caption.append(" · "+photo.captureDate);
        }
        if(typeof photo.osmSource==="string"&&/^(node|way|relation)\/[1-9]\d*$/.test(photo.osmSource))caption.append(" · ",link("https://www.openstreetmap.org/"+photo.osmSource,"© OpenStreetMap contributors"));
        if(photo.brandLogo===true){
          const note=document.createElement("strong");
          note.textContent="Логотип бренда · "+photo.brandName;
          caption.prepend(note,document.createElement("br"));
        }
        if(photo.nearby===true) {
          const note=document.createElement("strong");
          note.textContent="Фото рядом с местом (не самого объекта)"+(Number.isInteger(photo.nearbyMeters)&&photo.nearbyMeters>=0&&photo.nearbyMeters<=100?" · около "+photo.nearbyMeters+" м":"");
          caption.prepend(note,document.createElement("br"));
        }
        cover.hidden = true;
        image.src = photo.data;
        figure.hidden = false;
      };
      if(place.photo) renderPhoto(place.photo);
      else if(photoObserver&&shouldLookupPhoto(place)) {
        photoTasks.set(card,()=>{
          const current=()=>card.isConnected&&photoVersion===photoRenderVersion;
          loadPlacePhoto(place,current).then(photo=>{if(photo&&current())renderPhoto(photo);}).catch(()=>{});
        });
      }
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
    if(append)grid.append(fragment);
    else grid.replaceChildren(fragment);
    for(const card of photoTasks.keys())photoObserver.observe(card);
  }

  function showFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("guide-error", error);
  }

  function resetSearch() {
    category = "all";
    visibleLimit = pageSize();
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
  search.addEventListener("input", () => { visibleLimit = pageSize(); render(); });
  more.addEventListener("click", () => {
    const firstNew = visibleLimit;
    visibleLimit += pageSize();
    render(true);
    grid.children[firstNew]?.querySelector(".place-map")?.focus();
  });
  byId("clear-filters").addEventListener("click", () => {
    resetSearch();
    search.focus();
  });
  mobile.addEventListener('change', () => { visibleLimit = pageSize(); render(); });
  window.addEventListener("online",()=>render());
  return render;
}
