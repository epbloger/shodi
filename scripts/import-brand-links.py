"""Read all explicit brand links from the same dated Overture snapshot."""
import argparse
import json
import re
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
def catalog_rows():
    rows = []
    for line in (ROOT / "public/data/current-places.js").read_text(encoding="utf-8").splitlines():
        if re.match(r'^\s*"[^"]+":\s*\[', line):
            group = json.loads("{" + line.strip().rstrip(",") + "}")
            for places in group.values():
                rows.extend(places)
    return rows

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input")
    args = p.parse_args()
    catalog = catalog_rows()
    meta = json.loads((ROOT / "docs/current-catalog.json").read_text())
    release = meta["release"]
    if not re.fullmatch(r"20\d{2}-\d{2}-\d{2}\.\d+", release):
        raise ValueError("Unexpected catalog release")
    if not catalog or len(catalog) != meta["places"]:
        raise ValueError("Catalog row count mismatch")
    digests = {}
    for row in catalog:
        m = re.search(r"-o([0-9a-f]{12})$", row[0])
        if m:
            if m.group(1) in digests:
                raise ValueError("Duplicate catalog digest")
            digests[m.group(1)] = row[0]
    source = args.input or f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    links = {}
    with duckdb.connect() as con:
        if not args.input:
            con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
        con.execute("CREATE TEMP TABLE catalog_ids(digest VARCHAR)")
        con.executemany("INSERT INTO catalog_ids VALUES (?)", [(d,) for d in digests])
        rows = con.execute("""
            SELECT substring(sha256(CAST(p.id AS VARCHAR)),1,12),p.brand.names.primary,p.brand.wikidata
            FROM read_parquet(?) p
            JOIN catalog_ids c ON substring(sha256(CAST(p.id AS VARCHAR)),1,12)=c.digest
            WHERE upper(p.addresses[1].country)='RU' AND p.brand IS NOT NULL
        """, [source]).fetchall()
        for digest, name, qid in rows:
            name = " ".join((name or "").split())
            qid = qid if isinstance(qid,str) and re.fullmatch(r"Q[1-9]\d*",qid) else None
            if not name or len(name)>120 or re.search(r"[\x00-\x1f<>@]|(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}",name):
                continue
            links[digests[digest]]={"name":name,"qid":qid}
    if not links:
        raise RuntimeError("No Overture brand links; refusing empty brand import")
    report={"release":release,"catalogPlaces":len(catalog),"brandedPlaces":len(links),"distinctBrands":len({r["qid"] or r["name"].casefold() for r in links.values()}),"placesWithWikidataBrand":sum(bool(r["qid"]) for r in links.values()),"source":"Overture Maps","minimumBranchCount":1}
    (ROOT/"public/data/place-brands.js").write_text("// Overture Maps brand links, CDLA-Permissive-2.0.\nexport const placeBrands = "+json.dumps(links,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
    (ROOT/"docs/brand-coverage.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False),flush=True)
if __name__=="__main__":
    main()
