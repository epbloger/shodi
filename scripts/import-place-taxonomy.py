"""Recover precise classifications for the existing catalog from its exact snapshot."""
import argparse
import json
import re
from pathlib import Path
import duckdb
from importlib import import_module

catalog_rows = import_module("import-brand-links").catalog_rows
ROOT = Path(__file__).resolve().parents[1]
TOKEN = re.compile(r"[a-z][a-z0-9_]{0,100}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    args = parser.parse_args()
    meta = json.loads((ROOT / "docs/current-catalog.json").read_text())
    release = meta["release"]
    if not re.fullmatch(r"20\d{2}-\d{2}-\d{2}\.\d+", release):
        raise ValueError("Invalid catalog release")
    catalog = catalog_rows()
    ids = {}
    for row in catalog:
        match = re.search(r"-o([0-9a-f]{12})$", row[0])
        if match:
            if match[1] in ids:
                raise ValueError("Duplicate catalog digest")
            ids[match[1]] = row[0]
    if len(catalog) != meta["places"] or not ids:
        raise ValueError("Invalid catalog snapshot")
    source = args.input or f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    result = {}
    with duckdb.connect() as con:
        if not args.input:
            con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
        con.execute("CREATE TEMP TABLE catalog_ids(digest VARCHAR)")
        con.executemany("INSERT INTO catalog_ids VALUES (?)", [(d,) for d in ids])
        rows = con.execute("""
            SELECT substring(sha256(CAST(p.id AS VARCHAR)),1,12),
                   p.taxonomy.primary,p.taxonomy.hierarchy,p.basic_category
            FROM read_parquet(?) p
            JOIN catalog_ids c ON substring(sha256(CAST(p.id AS VARCHAR)),1,12)=c.digest
            WHERE upper(p.addresses[1].country)='RU'
        """, [source]).fetchall()
        for digest, primary, hierarchy, basic in rows:
            values = [primary, *reversed(hierarchy or []), basic]
            categories = list(dict.fromkeys(x for x in values if isinstance(x, str) and TOKEN.fullmatch(x)))
            if categories:
                result[ids[digest]] = categories[:20]
    if len(result) < len(ids)*.95:
        raise RuntimeError(f"Insufficient taxonomy coverage: {len(result)}/{len(ids)}")
    (ROOT/"public/data/place-taxonomy.js").write_text("// Generated Overture taxonomy; CDLA-Permissive-2.0.\nexport const placeTaxonomy = "+json.dumps(result,separators=(",",":"))+";\n")
    print(json.dumps({"taxonomyPlaces":len(result),"catalogPlaces":len(catalog),"release":release}))
if __name__ == "__main__":
    main()
