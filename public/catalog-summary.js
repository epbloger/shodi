// Original factual summaries, composed only from existing Overture fields.
// Do not infer specific offerings from a broad catalog category.
const types=Object.freeze({
 museum:"Музейное пространство",gallery:"Галерея или выставочное пространство",
 coffee:"Заведение категории кофеен и кафе",food:"Заведение общественного питания",
 park:"Парк или сад",architecture:"Объект архитектуры или историческая достопримечательность",
 walk:"Место для прогулок или туристическая достопримечательность",
 view:"Смотровая площадка или обзорная точка",books:"Книжный магазин или библиотека",
 family:"Место для семейного досуга",theater:"Театральная площадка",
 live:"Концертная или музыкальная площадка",market:"Рынок или торговая площадка",
 active:"Место для спорта или активного отдыха",night:"Бар или заведение вечернего досуга"
});
const clean=value=>typeof value==="string"?value.trim().replace(/\s+/g," "):"";
export function catalogSummary({kind,address,city,brand}){
 const type=Object.hasOwn(types,kind)?types[kind]:"Место из каталога";
 const location=clean(address)||clean(city);
 const name=clean(brand?.name);
 const text=[type+".",location?"Местоположение: "+location+".":"",name?"Бренд: "+name+".":""].filter(Boolean).join(" ");
 return text.length<=360?text:text.slice(0,357).trimEnd()+"…";
}
