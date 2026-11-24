import test from "node:test";
import assert from "node:assert/strict";
import {descriptionForPlace} from "../public/descriptions.js";
test("description requires exact name and nearby coordinates",()=>{
  assert.equal(descriptionForPlace("Исаакиевский собор",59.9341,30.3062)?.source,"https://www.wikidata.org/wiki/Q215423");
  assert.equal(descriptionForPlace("Исаакиевский собор",55.75,37.62),null);
  assert.equal(descriptionForPlace("Собор",59.9341,30.3062),null);
  assert.equal(descriptionForPlace("Эрмитаж",null,null),null);
});
