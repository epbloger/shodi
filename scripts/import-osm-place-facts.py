"""Match an entire regional OSM extract to the existing catalog, not individual API calls."""
import argparse, json, math, re, unicodedata
from collections import defaultdict
from pathlib import Path
from importlib import import_module
import osmium
catalog_rows=import_module("import-brand-links").catalog_rows
KEYS=("description:ru","description","start_date","architect","artist_name","heritage","cuisine","takeaway","outdoor_seating","wheelchair","fee","wikidata","wikimedia_commons","image")
def norm(s):
    return " ".join(unicodedata.normalize("NFC",s).lower().replace("ё","е").translate(str.maketrans("","","«»\"“”")).split())
def distance(a,b,c,d):
    return math.hypot((a-c)*111320,(b-d)*111320*math.cos(math.radians(c)))
def clean(s):
    return s.strip() if isinstance(s,str) and len(s)<=600 and not re.search(r"[\x00-\x1f<>@]",s) else ""
def compatible(kind,t):
    a=t.get("amenity",""); tourism=t.get("tourism",""); leisure=t.get("leisure",""); historic=t.get("historic",""); shop=t.get("shop","")
    if kind in ("food","coffee","night"):return a in ("restaurant","cafe","fast_food","food_court","bar","pub","ice_cream","biergarten") or shop in ("bakery","coffee","tea","confectionery")
    if kind=="museum":return tourism=="museum" or a=="museum"
    if kind=="gallery":return tourism=="gallery" or a in ("arts_centre","exhibition_centre")
    if kind=="theater":return a=="theatre"
    if kind=="live":return a in ("theatre","music_venue","concert_hall","arts_centre")
    if kind=="architecture":return bool(historic) or tourism in ("attraction","artwork")
    if kind=="walk":return bool(historic) or tourism in ("attraction","artwork","viewpoint") or leisure in ("park","garden") or t.get("natural")=="beach"
    if kind=="view":return tourism=="viewpoint"
    if kind=="park":return leisure in ("park","garden","nature_reserve") or t.get("boundary")=="national_park"
    if kind=="family":return tourism in ("zoo","aquarium","theme_park") or a in ("cinema","circus") or leisure in ("playground","water_park")
    if kind=="books":return a=="library" or shop=="books"
    if kind=="market":return a=="marketplace"
    if kind=="active":return bool(t.get("sport")) or leisure in ("sports_centre","stadium","pitch","ice_rink","swimming_pool")
    return False
class Matcher(osmium.SimpleHandler):
    def __init__(self,rows):
        super().__init__();self.index=defaultdict(list);self.hits=defaultdict(dict);self.seen=0
        for r in rows:
            if len(r)>=7 and r[6] in ("open","unknown",None):self.index[norm(r[1])].append(r)
    def consider(self,o,lat,lon,kind):
        if not math.isfinite(lat) or not math.isfinite(lon):return
        t=o.tags
        if any(t.get(k) for k in ("disused","abandoned","demolished","was:amenity","disused:amenity","abandoned:amenity")):return
        names=list(dict.fromkeys(s for k in ("name","name:ru","official_name","short_name") if (s:=clean(t.get(k)))))
        if not names:return
        tags={k:s for k in KEYS if (s:=clean(t.get(k)))}
        if not tags:return
        self.seen+=1
        candidates={r[0]:r for name in names for r in self.index.get(norm(name),()) if compatible(r[2],t) and distance(lat,lon,r[4],r[5])<=79}
        if len(candidates)!=1:return
        r=next(iter(candidates.values()));osm=kind+"/"+str(o.id)
        self.hits[r[0]][osm]={"osm":osm,"lat":round(lat,6),"lon":round(lon,6),"kind":r[2],"names":names,"tags":tags}
    def node(self,n):
        if n.location.valid() and n.tags.get("name"):self.consider(n,n.location.lat,n.location.lon,"node")
    def way(self,w):
        if not any(w.tags.get(k) for k in ("name","name:ru","official_name")):return
        pts=[(n.lat,n.lon) for n in w.nodes if n.location.valid()]
        if len(pts)<2:return
        lats,lons=zip(*pts)
        if distance(min(lats),min(lons),max(lats),max(lons))>600:return
        self.consider(w,(min(lats)+max(lats))/2,(min(lons)+max(lons))/2,"way")
def main():
    p=argparse.ArgumentParser();p.add_argument("input");p.add_argument("--output",required=True);p.add_argument("--index",required=True);a=p.parse_args()
    rows=catalog_rows();m=Matcher(rows);m.apply_file(a.input,locations=True,idx="sparse_file_array,"+a.index)
    result={id:next(iter(o.values())) for id,o in m.hits.items() if len(o)==1}
    if not result:raise RuntimeError("No unambiguous matches")
    Path(a.output).write_text("// OpenStreetMap contributors, ODbL 1.0; contents DbCL 1.0.\nexport const osmPlaceFacts = "+json.dumps(result,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
    print(json.dumps({"catalogPlaces":len(rows),"matched":len(result),"ambiguous":len(m.hits)-len(result),"namedSourceObjects":m.seen,"source":"Geofabrik 2026-11-24"}),flush=True)
if __name__=="__main__":main()
