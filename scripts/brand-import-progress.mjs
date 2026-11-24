// Schedule unresolved brands fairly without dropping earlier verified assets.
export function priorAttempts(report, brands, now=Date.now()){
 const result=new Map();
 if(!Array.isArray(report?.brands))return result;
 for(const row of report.brands){
  if(!row||!brands.has(row.key)||typeof row.lastAttemptAt!=="string")continue;
  const at=Date.parse(row.lastAttemptAt);
  if(Number.isFinite(at)&&at>=0&&at<=now)result.set(row.key,at);
 }
 return result;
}
export function unresolvedFirst(rows, attempts){
 return [...rows].sort((a,b)=>(attempts.get(a.brand.key)??-1)-(attempts.get(b.brand.key)??-1)||b.branches-a.branches||a.brand.key.localeCompare(b.brand.key));
}
