import test from "node:test";
import assert from "node:assert/strict";
import {verifyProductionAds} from "../scripts/verify-production-ads.mjs";

// Synthetic test values only; no production credentials are required or stored.
const kinds=["BANNER","INTERSTITIAL","NATIVE"];
const env=Object.fromEntries(kinds.map((kind,i)=>["SHODI_"+kind+"_ID",["R","M",0,i+1].join("-")]));
const config="public static final boolean PRODUCTION_ADS = true;\n"+kinds.map(kind=>'public static final String '+kind+'_ID = "'+env["SHODI_"+kind+"_ID"]+'";').join("\n");
const dex=[Buffer.from(Object.values(env).join("\0")+"\0")];
test("production ad verification checks expected config and compiled values without printing IDs",()=>{
 assert.doesNotThrow(()=>verifyProductionAds(config,dex,env));
 assert.throws(()=>verifyProductionAds(config.replace("true","false"),dex,env),/flag/);
 assert.throws(()=>verifyProductionAds(config,[],env),/DEX/);
 assert.throws(()=>verifyProductionAds(config,[Buffer.from("other")],env),/missing from DEX/);
 assert.throws(()=>verifyProductionAds(config.replace(env.SHODI_BANNER_ID,"wrong"),dex,env),/mismatch/);
 assert.throws(()=>verifyProductionAds(config,[...dex,Buffer.from("demo-native-content-yandex")],env),/Demo ad identifier/);
 assert.throws(()=>verifyProductionAds(config,dex,{...env,SHODI_NATIVE_ID:env.SHODI_BANNER_ID}),/duplicate/);
});
