// Editorial policy: unverified generic text is not a visitor-facing description.
// Keep all places and their map actions; prioritize cultural sites and recognized brands.
const culturalKinds=new Set(["museum","gallery","architecture","theater","view","park","walk","live"]);
export function hasUsefulDescription(place){
 return Boolean(place?.description?.trim()&&place.descriptionSource&&place.descriptionKind!=="catalog");
}
export function priorityForEnrichment(place){
 if(place?.brand)return "brand";
 if(place&&culturalKinds.has(place.kind))return "cultural";
 return "optional";
}
export function shouldLookupPhoto(place){
 return priorityForEnrichment(place)!=="optional"||hasUsefulDescription(place);
}
