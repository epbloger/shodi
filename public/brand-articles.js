import {brandArticles} from "./data/brand-articles.js";
import {brandNameKey} from "./brands.js";
import {validWikiSummary,wikiResult} from "./wiki-summary.js";
const sectors=Object.freeze({
 food:/ресторан|пиццери|бургер|общест[вв]енн\w*\s+питан|фастфуд|быстрого питания|суши|закусочн/iu,
 coffee:/кофейн|кафе|кондитерск|пекар|кофе/iu,
 night:/бар(?:ов|ы|а)?\b|паб|ночн\w*\s+клуб/iu,
 books:/книжн\w*\s+магазин|книготоргов/iu,
 family:/кинотеатр|развлекательн\w*\s+центр|парк\w*\s+развлечен/iu,
 active:/фитнес|спорт\w*\s+клуб|боулинг/iu
});
const suffix=/\s*\((?:сеть(?:\s+(?:ресторанов|кафе|кофеен|пиццерий|магазинов|кинотеатров))?|ресторанная сеть|компания|бренд)\)$/iu;
const chain=/сет[ьи]|франчайзинг|франшиз|сетью/iu;
const generic=/^(?:кафе|кофе|пицца|ресторан|бар|пекарня|кинотеатр|магазин|суши|бургер|книги)$/iu;
export function candidateBrandTitles(brand){
 if(!brand||typeof brand.name!=="string"||brand.name.length>80||/[|#<>{}\u0000-\u001f]/.test(brand.name)||generic.test(brand.name.trim()))return [];
 return [brand.name,brand.name+" (сеть ресторанов)",brand.name+" (сеть)",brand.name+" (компания)"];
}
export function matchesBrandArticle(row,brand,kinds){
 if(!validWikiSummary(row)||!brand||!candidateBrandTitles(brand).length||!Array.isArray(kinds)||!kinds.length)return false;
 if(brand.qid&&row.qid!==brand.qid)return false;
 if(brandNameKey(row.title.replace(suffix,""))!==brandNameKey(brand.name))return false;
 if(!chain.test(row.text)||!kinds.every(k=>Object.hasOwn(sectors,k)))return false;
 return kinds.some(k=>sectors[k].test(row.text));
}
export function brandArticleFor(brand,kind){
 if(!brand||!Object.hasOwn(brandArticles,brand.key))return null;
 const row=brandArticles[brand.key];
 return matchesBrandArticle(row,brand,[kind])?wikiResult(row,"wikipedia-brand"):null;
}
