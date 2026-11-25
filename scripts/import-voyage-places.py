"""Import real, geographically matched Russian Wikivoyage listing excerpts."""
import argparse, bz2, json, math, re, unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from importlib import import_module
import mwparserfromhell
catalog_rows=import_module("import-brand-links").catalog_rows
ALLOWED={"see":{"museum","gallery","theater","architecture","view","walk","park","family"},"do":{"family","active","theater","live","park","view","walk"},"buy":{"market","books"},"eat":{"coffee","food"},"drink":{"coffee","night","food"}}
def norm(s):
    return " ".join(unicodedata.normalize("NFC",s).lower().replace("ё","е").translate(str.maketrans("","","«»\"“”")).split())
def dist(lat,lon,r):
    return math.hypot((lat-r[4])*111320,(lon-r[5])*111320*math.cos(math.radians(r[4])))
def param(t,k):
    return str(t.get(k).value).strip() if t.has(k) else ""
def plain(s):
    return " ".join(mwparserfromhell.parse(s).strip_code(normalize=True,collapse=True).split())
def excerpt(s):
    s=plain(s)
    if len(s)<70 or re.search(r"[<>{}\x00-\x1f@]|https?://|(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|руб(?:лей|ля|ль|\.)|закрыт[ао]? навсегда|не работает",s,re.I):return None
    if len(s)>360:
        cut=s[:359];sent=max(cut.rfind(". "),cut.rfind("! "),cut.rfind("? "))
        s=cut[:sent+1] if sent>=100 else cut.rsplit(" ",1)[0]+"…"
    return s if len(s)>=70 else None
def image_name(s):
    s=re.sub(r"^(?:File|Image|Файл):","",s,flags=re.I).replace("_"," ").strip()
    return s if 0<len(s)<=350 and re.search(r"\.(?:jpe?g|png)$",s,re.I) and not re.search(r"[\x00-\x1f<>|#?/\\]",s) else None
def match_page(title,revision,raw,index,hits):
    if not raw or not re.search(r"\{\{\s*(?:listing|monument2?)\b",raw,re.I):return
    for t in mwparserfromhell.parse(raw).filter_templates(recursive=True):
        template=str(t.name).strip().lower()
        if template not in ("listing","monument","monument2"):continue
        monument=template!="listing"
        kind=param(t,"type") or param(t,"1")
        if monument:
            if not title.startswith("Культурное наследие России/") or kind not in ("architecture","history","archeology","monument") or param(t,"precise")!="yes" or param(t,"status") or param(t,"dismissed"):continue
            allowed={"architecture","walk","museum","theater","gallery"}
        else:
            if kind not in ALLOWED or param(t,"format")=="poi":continue
            allowed=ALLOWED[kind]
        name=plain(param(t,"name"))
        if not name or len(name)>100:continue
        try:lat,lon=float(param(t,"lat")),float(param(t,"long"))
        except ValueError:continue
        if not math.isfinite(lat) or not math.isfinite(lon):continue
        candidates=[r for r in index.get(norm(name),[]) if r[2] in allowed and dist(lat,lon,r)<=119]
        if len(candidates)!=1:continue
        raw_desc=param(t,"description")
        if monument:
            year=plain(param(t,"year"));author=plain(param(t,"author"));style=plain(param(t,"style"))
            parts=[]
            if re.fullmatch(r"(?:1[0-9]{3}|20[0-2][0-9])(?:[–—-](?:1[0-9]{3}|20[0-2][0-9]))?",year):parts.append("Датировка в каталоге наследия: "+year+".")
            if 2<=len(author)<=100 and re.fullmatch(r"[\w .,\-–—()]+",author):parts.append("Автор объекта: "+author+".")
            if style in ("конструктивизм","авангард","модерн"):parts.append("Архитектурный стиль: "+style+".")
            if param(t,"protection") in ("Ф","Р","М"):parts.append("В каталоге отмечен охранный статус памятника.")
            raw_desc=" ".join([raw_desc,*parts])
        text=excerpt(raw_desc)
        if not text:continue
        r=candidates[0]
        row={"name":name,"kind":r[2],"lat":lat,"lon":lon,"text":text,"title":title,"revision":revision,"license":"CC BY-SA 4.0","image":image_name(param(t,"image"))}
        hits[r[0]].append(row)
def main():
    p=argparse.ArgumentParser();p.add_argument("dump");p.add_argument("--output",required=True);a=p.parse_args()
    rows=catalog_rows();index=defaultdict(list);hits=defaultdict(list)
    for r in rows:
        if r[6] in ("open","unknown",None):index[norm(r[1])].append(r)
    pages=0
    with bz2.open(a.dump,"rb") as stream:
        ctx=ET.iterparse(stream,events=("start","end"))
        _,root=next(ctx);ns=root.tag.split("}")[0]+"}"
        for event,elem in ctx:
            if event!="end" or elem.tag!=ns+"page":continue
            if elem.findtext(ns+"ns")=="0":
                title=elem.findtext(ns+"title") or ""
                rev=elem.find(ns+"revision")
                if rev is not None and 0<len(title)<=250:
                    revision=int(rev.findtext(ns+"id") or 0)
                    if revision>0:match_page(title,revision,rev.findtext(ns+"text") or "",index,hits);pages+=1
            root.clear()
    out={}
    for id,entries in hits.items():
        # Prefer a travel description over a registry entry, never resolve conflicting peers by guess.
        travel=[r for r in entries if not r["title"].startswith("Культурное наследие России/")]
        unique={r["text"]:r for r in (travel or entries)}
        if len(unique)==1:out[id]=next(iter(unique.values()))
    if not out:raise RuntimeError("No unique geographically matched Wikivoyage listings")
    Path(a.output).write_text("// Wikivoyage contributors, CC BY-SA 4.0; excerpts shortened.\nexport const voyagePlaces = "+json.dumps(out,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
    print(json.dumps({"catalogPlaces":len(rows),"pages":pages,"matched":len(out),"ambiguous":len(hits)-len(out),"imageReferences":sum(bool(r["image"]) for r in out.values())}),flush=True)
if __name__=="__main__":main()
