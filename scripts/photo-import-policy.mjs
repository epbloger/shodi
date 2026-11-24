// Bound the offline photo bundle; count actual decoded bytes, not Base64 overhead.
export const PHOTO_LIMIT=500;
export const PHOTO_BYTES_LIMIT=24_000_000;
export function photoBytes(photo){
 const data=photo?.data;
 if(typeof data!=="string"||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))return 0;
 const bytes=Buffer.from(data.slice(data.indexOf(",")+1),"base64");
 const png=data.startsWith("data:image/png;");
 if(png?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))return 0;
 return bytes.length<=95000?bytes.length:0;
}
