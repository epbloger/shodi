"""Import Overture Places from a dated 2026 snapshot without inventing reviews."""
import argparse
from collections import defaultdict, Counter
import hashlib
import json
from pathlib import Path
import re
import math
import duckdb
from unidecode import unidecode

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "2026-11-18.0"
CATEGORIES = {
    "museum": "museum history_museum art_museum science_museum",
    "gallery": "art_gallery art_center exhibition_center",
    "theater": "theater performing_arts performing_arts_theater opera_house",
    "live": "concert_hall music_venue live_music_venue",
    "family": "zoo aquarium amusement_park water_park circus theme_park playground indoor_playground cinema movie_theater",
    "books": "bookstore book_store library",
    "view": "observation_deck scenic_viewpoint viewpoint lookout scenic_overlook observation_tower",
    "active": "ice_skating_rink skating_rink ski_resort climbing_gym go_kart stadium bowling_alley sports_complex swimming_pool skating",
    "park": "park botanical_garden garden national_park",
    "architecture": "monument historical_landmark historic_site historical_site castle memorial historic_building palace",
    "walk": "tourist_attraction landmark beach waterfront hiking_trail",
    "market": "market farmers_market food_market flea_market",
    "coffee": "coffee_shop cafe tea_house bakery",
    "food": "restaurant diner fast_food_restaurant food_court",
    "night": "bar pub nightclub cocktail_bar wine_bar",
}
CATEGORY_MAP = {cat: kind for kind, cats in CATEGORIES.items() for cat in cats.split()}
PROVIDERS = {"meta", "microsoft", "pinmeto", "krick", "renderseo", "dac", "brightquery",
             "birdeye", "uberall", "opentravelalliance", "opentravel", "alltheplaces"}
ALIASES = {"moscow": "Москва", "saintpetersburg": "Санкт-Петербург", "stpetersburg": "Санкт-Петербург",
           "yekaterinburg": "Екатеринбург", "ekaterinburg": "Екатеринбург",
           "nizhniynovgorod": "Нижний Новгород", "nizhnynovgorod": "Нижний Новгород",
           "nizhninovgorod": "Нижний Новгород"}
PRIVATE = re.compile(r"\b(?:кв\.|квартира|частный дом)|@|(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}", re.I)

def norm(s):
    return re.sub(r"[^\w]+|_", "", (s or "").casefold().replace("ё", "е"))

def latin(s):
    return norm(unidecode(s or ""))

def clean(s):
    return " ".join((s or "").split())

def cities_index():
    cities = []
    for line in (ROOT / "public/data/cities.js").read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith('["'):
            cities.append(json.loads(line.strip().rstrip(",")))
    index = defaultdict(set)
    for id, name, region in cities:
        for key in {norm(name), latin(name)}:
            index[key].add(id)
    for alias, name in ALIASES.items():
        index[alias].update(index[norm(name)])
    return {row[0]: row[1:] for row in cities}, index

def permitted_sources(sources):
    """Recognize documented provider IDs and human-readable source labels."""
    recognized = set()
    for source in sources or []:
        if not source:
            return False
        provider = norm(source.get("provider"))
        dataset = source.get("dataset") or ""
        # November labels include e.g. "Meta, Overture"; provider IDs may
        # also be encoded as provider/resource. Reject unknown licenses.
        prefix = dataset.split("/", 1)[0]
        labels = {norm(part) for part in re.split(r"[,;]", prefix) if part.strip()}
        labels -= {"overture", "overturemaps", "overturemapsfoundation"}
        if provider and provider not in {"overture", "overturemaps", "overturemapsfoundation"}:
            labels.add(provider)
        if not labels or not labels <= PROVIDERS:
            # An Overture-only processing record may accompany real sources.
            if not labels and (provider or dataset):
                continue
            return False
        recognized.update(labels)
    return bool(recognized)

def make_catalog(rows):
    cities, index = cities_index()
    groups = defaultdict(dict)
    stats, rejected_sources, unmatched_cities = Counter(), Counter(), Counter()
    for id, name, basic, primary, hierarchy, confidence, street, locality, lat, lon, sources in rows:
        stats["input"] += 1
        name, street, locality = clean(name), clean(street), clean(locality)
        if not name or len(name.encode("utf-16-le")) // 2 > 80 or PRIVATE.search(name) or PRIVATE.search(street):
            stats["invalid_name_or_address"] += 1
            continue
        # Only documented permissive providers, excluding Apache/Foursquare inputs.
        if not permitted_sources(sources):
            stats["source_rejected"] += 1
            rejected_sources.update(str((source or {}).get("dataset")) for source in sources or [])
            continue
        candidates = index.get(norm(locality), set()) | index.get(latin(locality), set())
        if len(candidates) != 1 or lat is None or lon is None or not math.isfinite(lat) or not math.isfinite(lon):
            stats["city_or_coordinates_rejected"] += 1
            unmatched_cities[locality] += 1
            continue
        city_id = next(iter(candidates))
        city, region = cities[city_id]
        kind = next((CATEGORY_MAP[x] for x in [basic, primary, *reversed(hierarchy or [])] if x in CATEGORY_MAP), None)
        if not kind:
            stats["category_rejected"] += 1
            continue
        address = ", ".join(dict.fromkeys(filter(None, [region, city, street])))
        if len(address) > 220:
            stats["address_too_long"] += 1
            continue
        stats["accepted"] += 1
        digest = hashlib.sha256(str(id).encode()).hexdigest()[:12]
        entry = [city_id + "-o" + digest, name, kind, address, round(lat, 6), round(lon, 6)]
        # Preserve distinct branches of the same chain, and deduplicate the same name/address.
        key = (norm(name), norm(street) or (round(lat, 4), round(lon, 4)))
        score = (float(confidence or 0), bool(street), str(id))
        previous = groups[city_id].get(key)
        if previous is None or score > previous[0]:
            groups[city_id][key] = (score, entry)
    result = {}
    for city_id, entries in sorted(groups.items()):
        ranked = sorted(entries.values(), key=lambda x: x[0], reverse=True)
        # Round-robin categories, so the first page is varied even in large cities.
        by_kind = defaultdict(list)
        for _, entry in ranked:
            by_kind[entry[2]].append(entry)
        selected, seen = [], set()
        for i in range(max(map(len, by_kind.values()))):
            for bucket in by_kind.values():
                if i < len(bucket) and bucket[i][0] not in seen:
                    selected.append(bucket[i])
                    seen.add(bucket[i][0])
        result[city_id] = selected
    print("Import counters:", dict(stats), flush=True)
    print("Rejected source labels:", rejected_sources.most_common(12), flush=True)
    print("Unmatched localities:", unmatched_cities.most_common(12), flush=True)
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", default=RELEASE)
    parser.add_argument("--input", help="Local GeoParquet fixture or explicit mirror")
    args = parser.parse_args()
    if not re.fullmatch(r"2026-\d{2}-\d{2}\.\d+", args.release):
        parser.error("Expected dated 2026 release")
    source = args.input or f"s3://overturemaps-us-west-2/release/{args.release}/theme=places/type=place/*"
    with duckdb.connect() as connection:
        if not args.input:
            connection.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
        cursor = connection.execute("""
            SELECT id, names.primary, basic_category, taxonomy.primary, taxonomy.hierarchy,
                   confidence, addresses[1].freeform, addresses[1].locality,
                   bbox.ymin, bbox.xmin, sources
            FROM read_parquet(?)
            WHERE upper(addresses[1].country) = 'RU'
              AND addresses[1].locality IS NOT NULL AND names.primary IS NOT NULL
              AND bbox.ymin BETWEEN 41 AND 82 AND bbox.xmin IS NOT NULL
              AND coalesce(confidence, 0) >= 0.65
              AND coalesce(operating_status, '') NOT IN ('permanently_closed', 'temporarily_closed')
              AND (basic_category IN (SELECT unnest(?)) OR taxonomy.primary IN (SELECT unnest(?))
                   OR list_has_any(taxonomy.hierarchy, ?))
        """, [source, list(CATEGORY_MAP), list(CATEGORY_MAP), list(CATEGORY_MAP)])
        def stream():
            while batch := cursor.fetchmany(10000):
                yield from batch
        catalog = make_catalog(stream())
    total = sum(map(len, catalog.values()))
    if len(catalog) < 500 or total < 15000 or len(catalog.get("spb", [])) < 100 or not all(catalog.get(c) for c in ("ekb","msk","spb","kzn","nn")):
        raise RuntimeError(f"Insufficient fresh coverage: {len(catalog)} cities, {total} places; existing catalog retained")
    category_counts = Counter(entry[2] for entries in catalog.values() for entry in entries)
    meta = {"release": args.release, "cities": len(catalog), "places": total, "source": "Overture Maps Foundation",
            "categories": dict(sorted(category_counts.items())), "saint_petersburg": len(catalog["spb"]),
            "saint_petersburg_categories": dict(Counter(entry[2] for entry in catalog["spb"]))}
    if len(meta["saint_petersburg_categories"]) < 10:
        raise RuntimeError("Saint Petersburg has insufficient category diversity")
    def enc(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "public/data/current-places.js").write_text(
        "// Overture Maps Places; adapted under CDLA-Permissive-2.0. See docs/data-sources.md.\n"
        + "export const currentCatalog = " + enc(meta) + ";\nexport const currentPlaces = {\n"
        + "".join("  " + enc(k) + ": " + enc(v) + ",\n" for k, v in catalog.items()) + "};\n", encoding="utf-8")
    (ROOT / "docs/current-catalog.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False))
    readme = ROOT / "README.md"
    text = readme.read_text(encoding="utf-8")
    text = re.sub(r"<!-- current-catalog -->.*?<!-- /current-catalog -->",
                  f"<!-- current-catalog -->\n**Обновление {args.release}:** {len(catalog)} городов, {total} мест из Overture Maps. Для остальных городов доступна отдельно обозначенная архивная подборка или поиск на карте.\n<!-- /current-catalog -->", text, flags=re.S)
    text = re.sub(r"(!\[Места\]\(https://img.shields.io/badge/Места-)\d+", r"\g<1>" + str(total), text)
    readme.write_text(text, encoding="utf-8")

if __name__ == "__main__":
    main()
