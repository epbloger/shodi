import test from "node:test";
import assert from "node:assert/strict";
import {hasUsefulDescription,priorityForEnrichment,shouldLookupPhoto} from "../public/catalog-presentation.js";
test("ordinary undocumented venues keep map access without generic descriptions or remote photo searches",()=>{
 const ordinary={kind:"food",description:"Кафе. Адрес: улица.",descriptionKind:"catalog"};
 assert.equal(hasUsefulDescription(ordinary),false);
 assert.equal(priorityForEnrichment(ordinary),"optional");
 assert.equal(shouldLookupPhoto(ordinary),false);
 assert.equal(priorityForEnrichment({...ordinary,brand:{key:"chain"}}),"brand");
 assert.equal(priorityForEnrichment({kind:"museum"}),"cultural");
 assert.equal(shouldLookupPhoto({kind:"museum"}),true);
 const sourced={...ordinary,descriptionKind:"editorial-place",descriptionSource:"https://example.org"};
 assert.equal(hasUsefulDescription(sourced),true);
 assert.equal(shouldLookupPhoto(sourced),true);
});
