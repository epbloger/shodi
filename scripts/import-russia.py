"""Build the Russian city guide from licensed city CSV and venue reviews Parquet."""

import argparse
from collections import Counter, defaultdict
import csv
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re

import duckdb

CURATED = {
    "екатеринбург": "ekb", "москва": "msk", "санкт-петербург": "spb",
    "казань": "kzn", "нижний новгород": "nn",
}
RUBRICS = {
    "museum": {"Музей"},
    "gallery": {"Выставочный зал", "Выставочный центр", "Художественная галерея"},
    "theater": {"Театр"},
    "live": {"Концертный зал"},
    "family": {"Зоопарк", "Океанариум", "Парк аттракционов", "Дельфинарий", "Аквапарк", "Цирк", "Аттракцион"},
    "books": {"Книжный магазин", "Библиотека"},
    "view": {"Смотровая площадка"},
    "active": {"Каток", "Верёвочный парк", "Лыжная база", "Скалодром", "Горнолыжный комплекс", "Картинг", "Стадион"},
    "park": {"Парк культуры и отдыха", "Лесопарк", "Сквер", "Ботанический сад"},
    "architecture": {"Памятник, мемориал", "Памятник технике", "Объект культурного наследия"},
    "walk": {"Достопримечательность", "Пляж", "Набережная"},
    "market": {"Продуктовый рынок", "Рынок"},
    "coffee": {"Кофейня", "Кондитерская"},
    "food": {"Ресторан", "Кафе"},
    "night": {"Бар, паб", "Ночной клуб"},
}
PRIVATE = re.compile(r"\b(?:кв\.|квартира|частный дом)|@|(?:\+7|8)\s*\(?\d{3}\)?[\s\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}", re.I)


def normalized(value):
    return " ".join(value.casefold().replace("ё", "е").split())


def city_name(value):
    return normalized(re.sub(r"^(?:г\.?|город)\s+", "", value.strip(), flags=re.I))


def region_name(row):
    name = row["region"]
    if row["region_type"] == "АО":
        if "автономный округ" in name.casefold():
            return re.sub(r"автономный округ", "АО", name, flags=re.I).replace(" - ", " — ")
        return f"{name} АО"
    return {
        "Респ": f"Республика {name}",
        "обл": f"{name} область",
        "край": f"{name} край",
        "Аобл": f"{name} автономная область",
        "Чувашия": f"Чувашская Республика",
    }.get(row["region_type"], name)


@dataclass(frozen=True)
class City:
    id: str
    name: str
    region: str
    region_key: str


def load_cities(path):
    cities = {}
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            name = row["settlement"] or row["city"] or re.sub(
                r"^(?:г\.?|город)\s+", "", row["address"].split(",")[-1].strip(), flags=re.I
            )
            city_id = CURATED.get(normalized(name), "ru-" + row["fias_id"].replace("-", "")[:12])
            if not name or city_id == "ru-" or city_id in cities:
                raise ValueError(f"Missing or repeated identity in city CSV: {name}")
            region_key = normalized(row["region"]).split(" автономный округ")[0]
            cities[city_id] = City(city_id, name, region_name(row), region_key)
    return cities


def match_city(parts, names):
    region_parts = [normalized(part) for part in parts[:2]]
    match = None
    # Yandex addresses start with the region or city, followed by districts and the street.
    for index, part in enumerate(parts[:4]):
        key = city_name(part)
        candidates = names.get(key, ())
        if len(candidates) == 1:
            match = candidates[0], index
        elif candidates:
            regional = [candidate for candidate in candidates if any(
                candidate.region_key != key and re.search(
                    rf"(?<!\w){re.escape(candidate.region_key)}(?!\w)", region
                ) for region in region_parts
            )]
            if len(regional) == 1:
                match = regional[0], index
    return match


def choose_kind(tags):
    return next((kind for kind, accepted in RUBRICS.items() if tags & accepted), None)


def venue_rows(connection, paths):
    return connection.execute("""
        SELECT address, name_ru, rubrics, count(*) AS reviews, sum(rating) AS total
        FROM read_parquet(?)
        WHERE rating BETWEEN 1 AND 5 AND address IS NOT NULL AND name_ru IS NOT NULL
          AND rubrics IS NOT NULL
        GROUP BY address, name_ru, rubrics
        ORDER BY address, name_ru, rubrics
    """, [paths])


def collect(cities, rows):
    names = defaultdict(list)
    grouped = {}
    for city in cities.values():
        names[normalized(city.name)].append(city)
    for address, name, raw_tags, reviews, total in rows:
        name = " ".join(name.split())
        address = " ".join(address.split())
        if not name or len(name.encode("utf-16-le")) // 2 > 80 or len(address) > 220:
            continue
        if PRIVATE.search(address) or PRIVATE.search(name):
            continue
        tags = set(raw_tags.split(";"))
        kind = choose_kind(tags)
        if not kind:
            continue
        pieces = [part.strip() for part in address.split(",") if part.strip()]
        match = match_city(pieces, names)
        if not match:
            continue
        city, index = match
        if city.id in CURATED.values():
            continue
        key = city.id, normalized(name), normalized(address)
        venue = grouped.setdefault(key, {
            "name": name, "address": address, "area": ", ".join(pieces[index + 1:]) or city.name,
            "tags": set(), "reviews": 0, "total": 0,
        })
        venue["tags"].update(tags)
        venue["reviews"] += reviews
        venue["total"] += total
    return grouped


def select_places(grouped, limit):
    candidates = defaultdict(list)
    for key, venue in grouped.items():
        city_id, name_key, _ = key
        count, total = venue["reviews"], venue["total"]
        if total < count * 4:
            continue
        # Prefer stronger evidence over a lone high score.
        adjusted_rating = (total + 4 * 3.8) / (count + 4)
        kind = choose_kind(venue["tags"])
        digest = hashlib.sha256("\x1f".join(key).encode()).hexdigest()[:12]
        tags = [tag for tag in sorted(venue["tags"]) if any(tag in accepted for accepted in RUBRICS.values())]
        record = [
            f"{city_id}-{digest}", venue["name"], kind, venue["area"], venue["address"],
            ", ".join(tags[:4]), round(total / count, 1), count,
        ]
        candidates[city_id].append((adjusted_rating, count, name_key, record))

    result = {}
    for city_id, places in sorted(candidates.items()):
        ordered = sorted(places, key=lambda item: (-item[0], -item[1], item[2], item[3][0]))
        categories = Counter()
        used_names = set()
        selected = []
        for category_limit in (1, 3, limit):
            for _, _, name, record in ordered:
                if len(selected) >= limit:
                    break
                kind = record[2]
                if name in used_names or categories[kind] >= category_limit:
                    continue
                selected.append(record)
                used_names.add(name)
                categories[kind] += 1
        result[city_id] = selected
    return result


def write_module(path, export, data, attribution):
    def encode(value):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    if isinstance(data, dict):
        rows = "\n".join(f"  {encode(key)}: {encode(values)}," for key, values in data.items())
        body = "{\n" + rows + "\n}"
    else:
        rows = "\n".join(f"  {encode(row)}," for row in data)
        body = "[\n" + rows + "\n]"
    path.write_text(f"// {attribution}\nexport const {export} = {body};\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("city_csv", type=Path)
    parser.add_argument("reviews", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.limit <= 32:
        parser.error("--limit must be between 1 and 32")
    cities = load_cities(args.city_csv)
    with duckdb.connect() as connection:
        cursor = venue_rows(connection, [str(path) for path in args.reviews])
        grouped = collect(cities, iter(lambda: cursor.fetchone(), None))
    places = select_places(grouped, args.limit)
    args.output.mkdir(parents=True, exist_ok=True)
    write_module(
        args.output / "cities.js", "russianCities",
        [[city.id, city.name, city.region] for city in cities.values()],
        "Adapted from DaData / HFLabs (CC BY-SA 4.0). See docs/data-sources.md.",
    )
    write_module(
        args.output / "places.js", "russianPlaces", places,
        "Based on Yandex Geo Reviews Dataset 2023 (MIT). See docs/data-sources.md.",
    )
    print(f"{len(cities)} cities, {len(places)} cities with imported places, {sum(map(len, places.values()))} places")


if __name__ == "__main__":
    main()
