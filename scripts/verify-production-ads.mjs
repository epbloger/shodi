import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const kinds=["BANNER","INTERSTITIAL","NATIVE"];
const demoIds=["demo-banner-yandex","demo-interstitial-yandex","demo-native-content-yandex"];
// Verify both the generated Java configuration and compiled DEX contents.
// Never include an ad ID or an environment variable value in output/errors.
export function verifyProductionAds(config,dexFiles,env){
 if(!/\bboolean\s+PRODUCTION_ADS\s*=\s*true\s*;/.test(config))throw Error("Production ads flag not enabled");
 if(!dexFiles.length)throw Error("No compiled DEX files");
 const seen=new Set();
 for(const kind of kinds){
  const id=env["SHODI_"+kind+"_ID"];
  if(typeof id!=="string"||!/^R-M-\d+-\d+$/.test(id)||seen.has(id))throw Error("Missing, malformed or duplicate production block: "+kind);
  seen.add(id);
  const actual=config.match(new RegExp("\\bString\\s+"+kind+"_ID\\s*=\\s*\"([^\"\\r\\n]*)\"\\s*;"))?.[1];
  if(actual!==id)throw Error("Generated release ad configuration mismatch: "+kind);
  if(!dexFiles.some(b=>b.includes(Buffer.from(id+"\0"))))throw Error("Configured release ad block missing from DEX: "+kind);
 }
 for(const id of demoIds)if(config.includes(id)||dexFiles.some(b=>b.includes(Buffer.from(id))))throw Error("Demo ad identifier in production artifact");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [configPath,apk]=process.argv.slice(2);
 if(!configPath||!apk)throw Error("Usage: verify-production-ads.mjs <release BuildConfig.java> <APK>");
 const files=execFileSync("unzip",["-Z1",apk],{encoding:"utf8"}).split(/\r?\n/).filter(n=>/^classes(?:\d+)?\.dex$/.test(n));
 const dex=files.map(n=>execFileSync("unzip",["-p",apk,n],{maxBuffer:64*1024*1024}));
 verifyProductionAds(readFileSync(configPath,"utf8"),dex,process.env);
 console.log("Verified production ad configuration and compiled DEX; no demo IDs");
}
