import {archiveContext} from "./data/archive-context.js";
const topics=Object.freeze({
 coffee:"кофейные напитки",pastry:"выпечка",desserts:"десерты",breakfast:"завтраки",pizza:"пицца",rolls:"роллы и суши",burgers:"бургеры",khachapuri:"хачапури",soups:"супы",tea:"чай",grill:"блюда на гриле",dumplings:"пельмени",icecream:"мороженое",cakes:"торты",
 tours:"экскурсии",exhibits:"экспозиции",paintings:"картины",interactive:"интерактивные экспонаты",performances:"спектакли",acoustics:"акустика",workshops:"мастер-классы",fountains:"фонтаны",alleys:"аллеи",benches:"скамейки",playground:"детская площадка",attractions:"аттракционы",animals:"животные",view:"вид на окрестности",books:"выбор книг",skates:"катание на коньках",bowling:"боулинг",pool:"бассейн"
});
export function archiveDescription(record){
 if(!record||!Array.isArray(record.topics)||record.topics.length<2||record.topics.length>4||new Set(record.topics).size!==record.topics.length||record.topics.some(k=>!Object.hasOwn(topics,k)))return null;
 const values=record.topics.map(k=>topics[k]);
 const text="В отзывах посетителей за 2023 год неоднократно упоминались "+values.slice(0,-1).join(", ")+" и "+values.at(-1)+". Это сведения о прежнем опыте посещения; актуальные условия стоит уточнить.";
 return {text,kind:"archive-context",source:"https://github.com/yandex/geo-reviews-dataset-2023/tree/8ed84aefeb3976106f89ed1c93c545941e2651f4",title:"Архив отзывов 2023 · сводка"};
}
export function archiveForPlace(id){
 return Object.hasOwn(archiveContext,id)?archiveDescription(archiveContext[id]):null;
}
