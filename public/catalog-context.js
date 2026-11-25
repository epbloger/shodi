// Geographical context from the same Overture snapshot, not a review or routing estimate.
const scenic=new Set(["museum","gallery","theater","architecture","park","view","walk","family","live"]);
const generic=/^(?:кафе|ресторан|кофейня|столовая|бар|парк|сквер|музей|театр|памятник|магазин|площадка|смотровая площадка|кинотеатр|детская площадка|restaurant|cafe|park)$/iu;
const keyName=s=>String(s||"").normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё","е").replace(/[«»"“”]/g,"").trim();
const radians=d=>d*Math.PI/180;
export function straightDistance(a,b){
 const dlat=radians(b[4]-a[4]),dlon=radians(b[5]-a[5]);
 const h=Math.sin(dlat/2)**2+Math.cos(radians(a[4]))*Math.cos(radians(b[4]))*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function createNearbyContext(rows){
 const valid=rows.filter(r=>Number.isFinite(r[4])&&Number.isFinite(r[5])&&(!r[6]||["open","unknown"].includes(r[6])));
 const lat=valid.length?valid.reduce((sum,r)=>sum+r[4],0)/valid.length:0;
 const factor=Math.max(.08,Math.cos(radians(lat))),step=1500,grid=new Map();
 const cell=r=>[Math.floor(r[4]*111320/step),Math.floor(r[5]*111320*factor/step)];
 for(const r of valid){
  if(!r[1]||generic.test(r[1].trim())||r[1].length>80)continue;
  const k=cell(r).join(",");
  if(!grid.has(k))grid.set(k,[]);
  grid.get(k).push({row:r,nameKey:keyName(r[1])});
 }
 return row=>{
  if(!Number.isFinite(row[4])||!Number.isFinite(row[5]))return null;
  const [y,x]=cell(row),nameKey=keyName(row[1]);let best=null,bestScore=Infinity;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)for(const {row:r,nameKey:otherKey} of grid.get((y+dy)+","+(x+dx))||[]){
   if(r[0]===row[0]||r[2]===row[2]||otherKey===nameKey)continue;
   const meters=straightDistance(row,r);
   if(meters<25||meters>1500)continue;
   const score=meters+(scenic.has(r[2])?0:350);
   if(score<bestScore||(score===bestScore&&r[0]<(best?.id||""))){bestScore=score;best={id:r[0],name:r[1],kind:r[2],meters};}
  }
  if(!best)return null;
  const n=Math.max(50,Math.round(best.meters/50)*50);
  const distance=n>=1000?(n/1000).toLocaleString("ru",{maximumFractionDigits:2})+" км":n+" м";
  return {...best,text:"Рядом — «"+best.name+"» (около "+distance+" по прямой). Эти места можно объединить в одном маршруте."};
 };
}
