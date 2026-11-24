import {readFile,writeFile} from "node:fs/promises";
const dependencies=JSON.parse(await readFile("android-runtime-dependencies.json","utf8"));
if(!Array.isArray(dependencies)||!dependencies.length)throw Error("No resolved Android dependencies");
const findings=[];
let checked=0;
for(let i=0;i<dependencies.length;i+=100){
  const batch=dependencies.slice(i,i+100);
  const result=await fetch("https://api.osv.dev/v1/querybatch",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({queries:batch.map(d=>({package:{name:d.name,ecosystem:"Maven"},version:d.version}))}),
    signal:AbortSignal.timeout(45000)
  });
  if(!result.ok)throw Error("OSV API HTTP "+result.status);
  const body=await result.json();
  if(!Array.isArray(body.results)||body.results.length!==batch.length)throw Error("Incomplete OSV result");
  for(let j=0;j<batch.length;j++){
    const record=body.results[j];
    if(record.next_page_token)throw Error("OSV result requires pagination; manual review needed");
    for(const vuln of record.vulns||[])findings.push({...batch[j],advisory:vuln.id,url:"https://osv.dev/vulnerability/"+vuln.id});
  }
  checked+=batch.length;
}
await writeFile("android-osv-report.json",JSON.stringify({checked,findings},null,2)+"\n");
console.log("OSV checked",checked,"resolved Maven modules;",findings.length,"reported advisories");
if(findings.length){console.log(JSON.stringify(findings,null,2));process.exitCode=1;}
