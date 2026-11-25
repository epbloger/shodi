// Original text derived from source categories, never invented reviews or amenities.
import {placeTaxonomy} from "./data/place-taxonomy.js";
const types=Object.freeze({
 museum:"Музейное пространство для знакомства с экспозициями",gallery:"Галерея или выставочное пространство для знакомства с искусством",
 coffee:"Кафе или кофейня — вариант остановки для отдыха",food:"Заведение общественного питания, которое можно включить в маршрут на обед или ужин",
 park:"Парк или сад, который можно включить в прогулочный маршрут",architecture:"Архитектурный или исторический объект, интересный как остановка на прогулке",
 walk:"Туристическая достопримечательность или прогулочное место",view:"Место для обзора окрестностей",books:"Книжный магазин или библиотека",
 family:"Место для семейного досуга",theater:"Театральная площадка; афишу и время спектаклей стоит уточнить заранее",
 live:"Музыкальная или концертная площадка; актуальную программу стоит проверить перед визитом",market:"Рынок или торговая площадка",
 active:"Место для спорта или активного отдыха",night:"Бар или заведение вечернего досуга"
});
const groups={
 food:{
 pizza_restaurant:"Пиццерия, специализирующаяся на пицце",pizzeria:"Пиццерия, специализирующаяся на пицце",
 sushi_restaurant:"Ресторан японской кухни с профилем суши",japanese_restaurant:"Ресторан японской кухни",
 chinese_restaurant:"Ресторан китайской кухни",italian_restaurant:"Ресторан итальянской кухни",georgian_restaurant:"Ресторан грузинской кухни",russian_restaurant:"Ресторан русской кухни",korean_restaurant:"Ресторан корейской кухни",vietnamese_restaurant:"Ресторан вьетнамской кухни",indian_restaurant:"Ресторан индийской кухни",mexican_restaurant:"Ресторан мексиканской кухни",thai_restaurant:"Ресторан тайской кухни",turkish_restaurant:"Ресторан турецкой кухни",seafood_restaurant:"Ресторан с профилем рыбы и морепродуктов",steakhouse:"Стейк-хаус — ресторан с мясным профилем",hamburger_restaurant:"Бургерная",burger_restaurant:"Бургерная",fast_food_restaurant:"Ресторан быстрого питания",cafeteria:"Столовая",canteen:"Столовая",buffet_restaurant:"Ресторан формата буфета",diner:"Закусочная",food_court:"Фуд-корт — площадка общественного питания"},
 coffee:{coffee_shop:"Кофейня с профилем кофейных напитков",tea_house:"Чайная",bakery:"Пекарня, специализирующаяся на выпечке",pastry_shop:"Кондитерская",ice_cream_shop:"Заведение с профилем мороженого",cafe:"Кафе — вариант остановки во время прогулки"},
 museum:{history_museum:"Исторический музей, посвящённый прошлому и культурному наследию",art_museum:"Художественный музей, посвящённый изобразительному искусству",science_museum:"Музей научной тематики"},
 gallery:{art_gallery:"Художественная галерея; актуальные выставки стоит уточнить",exhibition_center:"Выставочный центр; программу стоит проверить перед посещением"},
 park:{botanical_garden:"Ботанический сад — место для знакомства с растениями и прогулок",national_park:"Национальный парк — природная территория; правила посещения стоит проверить"},
 family:{zoo:"Зоопарк — место для знакомства с животными",aquarium:"Аквариум или океанариум — место для знакомства с подводным миром",amusement_park:"Парк аттракционов; доступные развлечения зависят от сезона",water_park:"Аквапарк — место для водного отдыха",theme_park:"Тематический парк развлечений",circus:"Цирк; расписание представлений стоит уточнить",cinema:"Кинотеатр; фильмы и сеансы стоит уточнить",movie_theater:"Кинотеатр; фильмы и сеансы стоит уточнить",playground:"Детская игровая площадка",indoor_playground:"Крытая детская игровая площадка"},
 theater:{opera_house:"Оперный театр; афишу стоит проверить",puppet_theater:"Кукольный театр; репертуар стоит уточнить",puppet_theatre:"Кукольный театр; репертуар стоит уточнить",ballet_theater:"Балетный театр; афишу стоит проверить",drama_theater:"Драматический театр; актуальный репертуар стоит уточнить",drama_theatre:"Драматический театр; актуальный репертуар стоит уточнить"},
 live:{concert_hall:"Концертный зал; афишу и время мероприятий стоит проверить"},
 books:{bookstore:"Книжный магазин — место для поиска книг",book_store:"Книжный магазин — место для поиска книг",library:"Библиотека; условия посещения стоит уточнить"},
 view:{observation_deck:"Смотровая площадка для обзора окрестностей",observation_tower:"Смотровая башня; доступ и режим посещения стоит уточнить"},
 architecture:{castle:"Замок — архитектурная достопримечательность",palace:"Дворец — архитектурная достопримечательность",monument:"Памятник, который можно включить в маршрут по достопримечательностям",memorial:"Мемориальный объект — место памяти",historic_building:"Историческое здание для архитектурного маршрута"},
 walk:{beach:"Пляж — место для отдыха у воды; сезонные условия стоит проверить",waterfront:"Прибрежная прогулочная зона",hiking_trail:"Пешеходный маршрут; сложность и доступность стоит проверить"},
 market:{farmers_market:"Фермерский рынок; ассортимент зависит от продавцов и сезона",flea_market:"Блошиный рынок; часы работы стоит уточнить"},
 active:{ice_skating_rink:"Каток; расписание сеансов стоит уточнить",skating_rink:"Каток; расписание стоит уточнить",ski_resort:"Горнолыжный комплекс; состояние трасс и сезонные условия стоит проверить",climbing_gym:"Скалодром — площадка для занятий скалолазанием",bowling_alley:"Боулинг",swimming_pool:"Бассейн; расписание и условия посещения стоит уточнить",stadium:"Стадион — спортивная площадка"},
 night:{nightclub:"Ночной клуб; программу мероприятий и условия входа стоит проверить",cocktail_bar:"Коктейльный бар",wine_bar:"Винный бар",pub:"Паб — заведение вечернего досуга"}
};
const clean=value=>typeof value==="string"?value.trim().replace(/\s+/g," "):"";
export function specificType(kind,tokens=[]){
 const group=Object.hasOwn(groups,kind)?groups[kind]:null;
 if(!group)return null;
 for(const token of tokens)if(Object.hasOwn(group,token))return group[token];
 return null;
}
export function hasSpecificType(id,kind){
 return Boolean(specificType(kind,Object.hasOwn(placeTaxonomy,id)?placeTaxonomy[id]:[]));
}
export function catalogSummary({id,kind,address,city,brand,tokens,context}){
 const subtype=specificType(kind,tokens??(Object.hasOwn(placeTaxonomy,id)?placeTaxonomy[id]:[]));
 const type=subtype??(Object.hasOwn(types,kind)?types[kind]:"Место из каталога");
 const location=clean(address)||clean(city), name=clean(brand?.name);
 const base=type+"."+(name?" Бренд — «"+name+"».":"");
 const useful=clean(context);
 const text=useful&&base.length+useful.length+1<=360?base+" "+useful:base+(location?" Адрес: "+location+".":"");
 return text.length<=360?text:text.slice(0,357).trimEnd()+"…";
}
