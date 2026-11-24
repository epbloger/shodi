import {brandLogos} from "./data/brand-logos.js";
import {placeBrands} from "./data/place-brands.js";
import {unrestrictedPhotoLicense} from "./photos.js";
const qid=/^Q[1-9]\d*$/;
export const brandNameKey=s=>String(s||"").normalize("NFKC").toLocaleLowerCase("ru").replaceAll("ё","е").replace(/[«»"“”]/g,"").replace(/[‐‑–—-]/g," ").replace(/\s+/g," ").trim();
const seeds=[
 {qid:"Q112406961",name:"Вкусно — и точка",aliases:["Вкусно — и точка","Вкусно и точка","Vkusno i tochka"],file:"Vkusno I Tochka symbol.svg",kind:["food"]},
 {qid:"Q177054",name:"Burger King",aliases:["Burger King","Бургер Кинг","Бургеркинг"],file:"Burger King 2020.svg",kind:["food"]},
 {qid:"Q3442874",name:"Rostic's",aliases:["Rostic's","Rostic’s","Ростикс"],file:"Текстовой логотип сети Rostic's.svg",kind:["food"]},
 {qid:"Q524757",name:"KFC",aliases:["KFC","КФС"],file:"KFC logo wordmark.svg",kind:["food"]},
 {qid:"Q55662627",name:"Coffee Like",aliases:["Coffee Like"],kind:["coffee","food"]}
];
export function brandForPlace(id,name,kind){
 const row=Object.hasOwn(placeBrands,id)?placeBrands[id]:null;
 const valid=row&&typeof row.name==="string"&&row.name.trim()&&row.name.length<=120&&(row.qid===null||qid.test(row.qid));
 const seed=seeds.find(b=>b.kind.includes(kind)&&(valid&&row.qid===b.qid||(!valid||!row.qid)&&b.aliases.some(n=>brandNameKey(n)===brandNameKey(valid?row.name:name))));
 if(seed)return {name:seed.name,qid:seed.qid,file:seed.file,key:seed.qid};
 if(!valid)return null;
 return {name:row.name,qid:row.qid,key:row.qid||"name:"+brandNameKey(row.name)};
}
export function brandMatches(entity,brand){
 if(!entity||!qid.test(entity.id))return false;
 if(brand.qid)return entity.id===brand.qid;
 return ["ru","en"].flatMap(lang=>[entity.labels?.[lang]?.value,...(entity.aliases?.[lang]||[]).map(x=>x.value)]).some(n=>brandNameKey(n)===brandNameKey(brand.name));
}
export function logoFiles(entity){
 return [...new Set((entity?.claims?.P154||[]).filter(c=>c.rank!=="deprecated"&&!c.qualifiers?.P582?.length).sort((a,b)=>Number(b.rank==="preferred")-Number(a.rank==="preferred")).map(c=>c.mainsnak?.datavalue?.value).filter(s=>typeof s==="string"&&s.length<=350&&/\.(svg|png|jpe?g)$/i.test(s)))].slice(0,3);
}
const pdUrl="https://creativecommons.org/publicdomain/mark/1.0/";
export function brandLicense(metadata){
 const val=k=>metadata?.[k]?.value;
 const restrictions=val("Restrictions");
 const list=restrictions==null||restrictions===""?[]:Array.isArray(restrictions)?restrictions:typeof restrictions==="string"?[restrictions]:["unknown"];
 if(list.some(r=>typeof r!=="string"||!/^(?:trademark|trademarked|trademark restrictions)$/i.test(r.trim())))return null;
 const cc=unrestrictedPhotoLicense({...metadata,Restrictions:{value:[]}});
 if(cc)return {...cc,trademark:true};
 // Copyright status is distinct from trademark rights. Only explicit PD metadata.
 if(String(val("Copyrighted")).toLowerCase()==="false"&&/^(public domain|pd)$/i.test(String(val("LicenseShortName")))&&/^pd(?:[-_][a-z0-9_-]+)?$/i.test(String(val("License"))))
   return {name:"Public domain",url:pdUrl,trademark:true};
 return null;
}
export function validBrandLogo(p,brand){
 if(!p||p.brandLogo!==true||p.brandKey!==brand.key||p.brandName!==brand.name||p.nearby===true||typeof p.data!=="string"||p.data.length>140000||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data)||typeof p.author!=="string"||!p.author.trim()||p.author.length>500||typeof p.title!=="string"||!p.title.startsWith("File:")||p.title.length>500||typeof p.source!=="string"||!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s?#]+$/.test(p.source))return false;
 return p.license==="Public domain"?p.licenseUrl===pdUrl:Boolean(unrestrictedPhotoLicense({LicenseShortName:{value:p.license},LicenseUrl:{value:p.licenseUrl},Restrictions:{value:[]}}));
}

export function bundledBrandLogo(brand){
 if(!brand||!Object.hasOwn(brandLogos,brand.key))return null;
 const logo={...brandLogos[brand.key],brandName:brand.name};
 return validBrandLogo(logo,brand)?logo:null;
}
