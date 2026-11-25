// Verified overrides for the frozen Overture snapshot. Keep raw records and IDs intact.
// Apply only to the exact original name/category/address/coordinates; a later snapshot
// may have fixed the record independently or changed its identity.
const entries = [
  {
    id: "kzn-oeb16ffdc1b10", cityId: "kzn",
    before: ["Казанский татарский государственный театр юного зрителя им. Г. Кариева", "theater", "Республика Татарстан, Казань, улица Гладилова 49", 55.808907, 49.068401],
    after: { address: "Республика Татарстан, Казань, Петербургская улица 55Б", lat: 55.7807, lon: 49.1367 },
    sources: ["https://karievteatr.ru/contacts", "https://kzn.bebeshka.info/kazan/kazanskiy-tatarskiy-gosudarstvennyy-teatr-yunogo-zritelya-imeni-gabdully-karieva-437341/"],
  },
  {
    id: "kzn-o05753d6efb94", cityId: "kzn",
    before: ["Памятник зодчим Казанского кремля", "architecture", "Республика Татарстан, Казань, Кот Казанский, Кремлёвская улица 15/25", 55.799408, 49.106209],
    after: { address: "Республика Татарстан, Казань, Казанский Кремль, у Благовещенского собора" },
    sources: ["https://go.kzn.ru/places/pamiatnik-zodcim-kazanskogo-kremlia", "https://www.russian-goldenring.ru/sights/3820/"],
  },
  {
    id: "msk-o20dba94845a0", cityId: "msk",
    before: ["Вднх, Павильон #13 Музей Востока", "museum", "Москва, Павильон 13, Подъёмная улица 12А", 55.830982, 37.627995],
    after: { address: "Москва, проспект Мира 119, павильон 13" },
    photoQid: "Q48948839",
    sources: ["https://vdnh.ru/places/pavilon-13-muzey-vostoka/", "https://www.3dcheck.zkir.ru/regions/RU-MOW/W28852156", "https://www.wikidata.org/wiki/Q48948839"],
  },
  {
    id: "msk-o86e7cab7c588", cityId: "msk",
    before: ["Московский Государственный Музей Дом Бурганова", "museum", "Москва, Большой Афанасьевский переулок 15 стр 1", 55.746811, 37.596676],
    after: { address: "Москва, Большой Афанасьевский переулок 15, стр. 9", lat: 55.7465386, lon: 37.5971869 },
    sources: ["https://burganov.ru/kontakty/", "https://www.tourister.ru/world/europe/russia/city/moscow/museum/12608"],
  },
  {
    id: "kzn-o5ff02a5244f4", cityId: "kzn",
    before: ["Казанский Кремль", "museum", "Республика Татарстан, Казань, проезд Шейкмана", 55.783298, 49.166698],
    after: { lat: 55.799453, lon: 49.106460 },
    photoQid: "Q603622",
    sources: ["https://whc.unesco.org/en/list/980/maps/", "https://kazan-kremlin.ru/", "https://www.wikidata.org/wiki/Q603622"],
  },
  {
    id: "kzn-ob595a5d2fd62", cityId: "kzn",
    before: ["Музей истории государственности Татарстана", "museum", "Республика Татарстан, Казань, Территория Военный Городок-2 4", 55.757339, 49.152699],
    after: { address: "Республика Татарстан, Казань, Казанский Кремль, Дворцовая церковь", lat: 55.8008, lon: 49.1050 },
    sources: ["https://kazan-kremlin.ru/museums/muzej-istorii-gosudarstvennosti-tatarskogo-naroda-i-respubliki-tatarstan", "https://kzn.bebeshka.info/kazan/muzey-istorii-gosudarstvennosti-tatarskogo-naroda-i-respubliki-tatarstan-89679/"],
  },
  {
    id: "ru-7eeb876e7b67-oc8dcf150d8dd", cityId: "ru-7eeb876e7b67",
    before: ["Музей-заповедник А.П. Чехова «Мелихово»", "museum", "Московская область, Чехов, село Мелихово", 64.227875, 55.371094],
    after: { lat: 55.114463, lon: 37.647121 },
    photoQid: "Q564901", photoFile: "Chekhov's Kitchen, Melikhovo.JPG",
    sources: ["https://chekhovmuseum.com/contacts", "https://archi.ru/projects/russia/20501/vizit-centr-gosudarstvennogo-literaturno-memorialnogo-muzeya-zapovednika-a-p-chekhova-melikhovo", "https://www.wikidata.org/wiki/Q564901", "https://commons.wikimedia.org/wiki/File:Chekhov%27s_Kitchen,_Melikhovo.JPG"],
  },
  {
    id: "nn-o9c0838acd24a", cityId: "nn",
    before: ["Нижегородская Ярмарка", "theater", "Нижегородская область, Нижний Новгород, Совнаркомовская улица 13/1", 56.328259, 43.961224],
    after: { kind: "architecture" },
    photoQid: "Q2371326",
    sources: ["https://www.yarmarka.ru/", "https://www.wikidata.org/wiki/Q2371326"],
  },
  {
    id: "spb-o20250f8ba7e2", cityId: "spb",
    before: ["Baggins Coffee Греческий пр.10", "architecture", "Санкт-Петербург, Греческий проспект 10", 59.938709, 30.369049],
    after: { kind: "coffee" },
    sources: ["https://coffeeroasters.ru/cafe/sankt-peterburg/baggins-coffee-grecheskiy-pr-10", "https://www.beboss.ru/franchise/4179/locations"],
  },
];

export const catalogCorrections = Object.freeze(entries.map(entry => Object.freeze({
  ...entry, before: Object.freeze(entry.before), after: Object.freeze(entry.after), sources: Object.freeze(entry.sources),
})));
const byId = new Map(catalogCorrections.map(entry => [entry.id, entry]));

function matchingCorrection(row) {
  const entry = byId.get(row?.[0]);
  return entry && entry.before.every((value, index) => row[index + 1] === value) ? entry : undefined;
}

export function effectiveRow(row) {
  const entry = matchingCorrection(row);
  if (!entry) return row;
  const result = [...row];
  for (const [field, index] of [["kind", 2], ["address", 3], ["lat", 4], ["lon", 5]]) {
    if (Object.hasOwn(entry.after, field)) result[index] = entry.after[field];
  }
  return result;
}

// All current corrections retain their verified city grouping; the ID prefix remains stable.
export function effectiveCity(cityId, row) {
  return matchingCorrection(row)?.cityId ?? cityId;
}

export function effectiveRowsForCity(catalog, cityId) {
  return Object.hasOwn(catalog, cityId) ? catalog[cityId].map(effectiveRow) : [];
}

// The photo identity is verified independently of the original erroneous coordinates.
// Require the complete corrected name/category/address/coordinate tuple before use.
export function effectivePhotoIdentity(row) {
  const entry=byId.get(row?.[0]);
  if(!entry?.photoQid)return null;
  const expected=effectiveRow([entry.id,...entry.before]);
  if(!expected.slice(0,6).every((value,index)=>row[index]===value))return null;
  return {qid:entry.photoQid,file:entry.photoFile};
}
