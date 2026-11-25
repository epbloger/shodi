"""Extract repeated topics, not copied reviews or current claims, from the licensed 2023 corpus."""
import argparse, json, re, unicodedata, hashlib
from collections import defaultdict, Counter
from pathlib import Path
from importlib import import_module
import duckdb
ROOT=Path(__file__).resolve().parents[1]
catalog_rows=import_module("import-brand-links").catalog_rows
rubrics=import_module("import-russia").RUBRICS
def norm(s):
    return " ".join(unicodedata.normalize("NFKC",s or "").lower().replace("ё","е").translate(str.maketrans("","","«»\"“”")).split())
def citykey(s):
    return re.sub(r"^(?:г\.?|город)\s+","",norm(s))
def streetkey(s):
    s=norm(s)
    s=re.sub(r"\bул\.?(?=\s|$)","улица",s)
    s=re.sub(r"\bпросп\.?(?=\s|$)","проспект",s)
    s=re.sub(r"\bпер\.?(?=\s|$)","переулок",s)
    s=re.sub(r"\bнаб\.?(?=\s|$)","набережная",s)
    s=re.sub(r"\b(?:д\.?|дом)\s+(?=\d)","",s)
    s=re.sub(r"\b(?:корпус|корп\.)\s*(?=\d)","к",s)
    s=re.sub(r"\b(?:строение|стр\.)\s*(?=\d)","с",s)
    s=re.sub(r"(?<=\d)\s*([кс])\s*(?=\d)",r"\1",s)
    s=re.sub(r"[,.;]\s*"," ",s)
    # Only explicit house identifiers; keep every street token, including street type.
    m=re.fullmatch(r"(.+?)\s+(\d+[а-я]?(?:[/-]\d+[а-я]?|к\d+|с\d+)*)",s.strip())
    if not m:return None
    return " ".join(sorted(m[1].split()))+"|"+m[2]
def cities():
    data={}
    for line in (ROOT/"public/data/cities.js").read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith('["'):
            row=json.loads(line.strip().rstrip(","))
            data[row[0]]=(row[1],row[2])
    return data
def address_keys(address,city,region,unique):
    parts=[p.strip() for p in (address or "").split(",") if p.strip()]
    found=[]
    for i,p in enumerate(parts[:-1]):
        if citykey(p)!=citykey(city):continue
        if not unique and not any(norm(r)==norm(region) for r in parts[:i]):continue
        tail=streetkey(" ".join(parts[i+1:]))
        if tail:found.append(tail)
    return set(found)
food={"coffee":r"\b(?:кофе|капучино|латте|эспрессо)\b","pastry":r"\b(?:выпечк[ауеи]|круассан[ыа]?|булочк[аи])\b","desserts":r"\bдесерт(?:ы|ов|а)?\b","breakfast":r"\bзавтрак(?:и|ов|а)?\b","pizza":r"\bпицц[ауые]\b","rolls":r"\b(?:роллы|роллов|суши)\b","burgers":r"\bбургер(?:ы|ов|а)?\b","khachapuri":r"\bхачапури\b","soups":r"\b(?:супы|борщ|солянка|суп)\b","tea":r"\bчай\b","grill":r"\b(?:на гриле|шашлык|шашлыки)\b","dumplings":r"\bпельмени\b","icecream":r"\bмороженое\b","cakes":r"\bторт(?:ы|ов|а)?\b"}
culture={"tours":r"\bэкскурси[яиюей]\b","exhibits":r"\bэкспозици[яиюей]\b","paintings":r"\bкартин[аыу]\b","interactive":r"\bинтерактивные экспонаты\b","performances":r"\bспектакл(?:ь|и|я|ей)\b","acoustics":r"\bакустик[ауи]\b","workshops":r"\bмастер[- ]класс(?:ы|ов)?\b"}
outdoor={"fountains":r"\bфонтан(?:ы|ов|а)?\b","alleys":r"\bалле[яиюй]\b","benches":r"\bскамейк[аи]\b","playground":r"\bдетск(?:ая|ую) площадк[ау]\b","attractions":r"\bаттракцион(?:ы|ов)?\b","animals":r"\bживотн(?:ые|ых)\b","view":r"\bвид на (?:город|реку|море|горы|озеро|набережную)\b"}
patterns={k:food for k in ("food","coffee","night")}
patterns.update({k:culture for k in ("museum","gallery","theater","live")})
patterns.update({k:outdoor for k in ("park","walk","view","family","architecture")})
patterns["books"]={"books":r"\b(?:выбор|ассортимент) книг\b","workshops":culture["workshops"]}
patterns["active"]={"skates":r"\b(?:каток|коньки|на коньках)\b","bowling":r"\bбоулинг\b","pool":r"\bбассейн\b"}
def extract(text,kind):
    out=set()
    for sentence in re.split(r"[.!?\n;]+",norm(text)):
        # Drop claims involving absence, negatives, speculation, or comparisons.
        if re.search(r"\b(?:нет|не|без|раньше|закрыт\w*|хотел\w*|если|жаль|вместо|плох\w*|ужас\w*|отсутств\w*|почему|соседн\w*)\b",sentence):continue
        for key,pattern in patterns.get(kind,{}).items():
            if re.search(pattern,sentence):out.add(key)
    return out
def main():
    p=argparse.ArgumentParser();p.add_argument("parquet",nargs="+");p.add_argument("--output",required=True);a=p.parse_args()
    rows=catalog_rows();citymap=cities();counts=Counter(citykey(c) for c,_ in citymap.values())
    index=defaultdict(list);by_name=defaultdict(set)
    for r in rows:
        city_id=re.sub(r"-o[0-9a-f]{12}$","",r[0])
        if city_id not in citymap or r[6] not in ("open","unknown",None):continue
        c,region=citymap[city_id]
        for street in address_keys(r[3],c,region,counts[citykey(c)]==1):
            index[(norm(r[1]),city_id,street)].append(r)
            by_name[norm(r[1])].add(city_id)
    topics=defaultdict(Counter);seen=defaultdict(set);matched=set()
    with duckdb.connect() as con:
        cursor=con.execute("SELECT address,name_ru,rubrics,text,rating FROM read_parquet(?) WHERE address IS NOT NULL AND name_ru IS NOT NULL AND text IS NOT NULL AND rating BETWEEN 4 AND 5",[a.parquet])
        while batch:=cursor.fetchmany(10000):
            for address,name,tags,text,rating in batch:
                if not isinstance(text,str) or len(text)>20000:continue
                candidates={}
                for cid in by_name.get(norm(name),()):
                    c,region=citymap[cid]
                    for street in address_keys(address,c,region,counts[citykey(c)]==1):
                        for r in index.get((norm(name),cid,street),()):
                            if set((tags or "").split(";")) & rubrics.get(r[2],set()):candidates[r[0]]=r
                if len(candidates)!=1:continue
                id,r=next(iter(candidates.items()))
                digest=hashlib.sha256(norm(text).encode()).digest()
                if digest in seen[id]:continue
                seen[id].add(digest);matched.add(id)
                for topic in extract(text,r[2]):topics[id][topic]+=1
    out={}
    for id,counts in topics.items():
        selected=[k for k,n in sorted(counts.items(),key=lambda x:(-x[1],x[0])) if n>=2][:4]
        if len(selected)>=2:out[id]={"topics":selected}
    if not out:raise RuntimeError("No supported archival summaries")
    Path(a.output).write_text("// Derived from Yandex Geo Reviews Dataset 2023, MIT; historical visitor reports.\nexport const archiveContext = "+json.dumps(out,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
    print(json.dumps({"catalogPlaces":len(rows),"matched":len(matched),"supportedSummaries":len(out),"source":"Yandex Geo Reviews Dataset 2023","license":"MIT"}),flush=True)
if __name__=="__main__":main()
