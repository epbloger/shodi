// Original editorial descriptions based on researched facts, not copied prose.
import {brandNameKey} from "./brands.js";
const places=[
 {names:["Екатеринбургский театр кукол","Екатеринбургский муниципальный театр кукол","Театр кукол"],kind:"theater",lat:56.83835,lon:60.61890,text:"Театр открылся в 1932 году спектаклем «Письмо из Италии». Здесь ставят кукольные спектакли для детей и взрослых, а с 2002 года театр проводит международный фестиваль «Петрушка Великий».",source:"https://theatre-museum.ru/theater/18666",title:"Театральные архивы России"},
 {names:["Дом Севастьянова","Дом профсоюзов","Дом Севастьянова (Дом профсоюзов)"],kind:"architecture",lat:56.83901,lon:60.60594,text:"Особняк у городского пруда приобрёл свой необычный облик в 1866 году по проекту Александра Падучева. Неоготический декор и барочные детали сочетаются с более ранней классической основой. Особенно интересно рассмотреть фасад со стороны набережной.",source:"https://museumarch.ru/ekskurs-archiv/tpost/dloy09eat1-dom-sevastyanova",title:"Музей архитектуры и дизайна УрГАХУ"}
];
const brands=[
 {names:["Coffee Like","Кофе Лайк","Кофелайк"],qids:["Q55662627"],kinds:["coffee","food"],text:"Сеть появилась в Ижевске в 2013 году и развивалась в формате кофе с собой. Удобный вариант для короткой остановки с напитком во время прогулки.",source:"https://coffee-like.com/about",title:"История Coffee Like"},
 {names:["Додо Пицца","Dodo Pizza"],kinds:["food"],text:"История этой сети началась в Сыктывкаре в 2011 году. Первая пиццерия работала на доставку, а со временем проект вырос в международную сеть. Подойдёт для остановки на пиццу во время городского маршрута.",source:"https://dodobrands.io/ru//",title:"История Dodo Brands"},
 {names:["Skuratov Coffee","Skuratov","Скуратов Кофе"],kinds:["coffee"],text:"Омская сеть выросла из проекта по обжарке кофе, начатого в 2013 году. Компания развивает собственное обжарочное производство; формат интересен тем, кто хочет познакомиться с культурой кофе.",source:"https://skuratovcoffee.ru/roasting_process",title:"Skuratov Coffee — история обжарки"}
];
export function editorialGuide({name,kind,lat,lon,brand}){
 if(Number.isFinite(lat)&&Number.isFinite(lon)){
  const matches=places.filter(p=>p.kind===kind&&p.names.some(n=>brandNameKey(n)===brandNameKey(name))&&Math.hypot((lat-p.lat)*111320,(lon-p.lon)*111320*Math.cos(lat*Math.PI/180))<=120);
  if(matches.length===1){const p=matches[0];return {text:p.text,source:p.source,title:p.title,kind:"editorial-place"};}
 }
 if(!brand)return null;
 const matches=brands.filter(b=>b.kinds.includes(kind)&&((b.qids||[]).includes(brand.qid)||b.names.some(n=>brandNameKey(n)===brandNameKey(brand.name))));
 if(matches.length!==1)return null;
 const b=matches[0];
 return {text:"О бренде: "+b.text,source:b.source,title:b.title,kind:"editorial-brand"};
}
