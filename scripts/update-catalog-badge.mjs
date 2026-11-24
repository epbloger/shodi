import { readFile, writeFile } from "node:fs/promises";
const data = JSON.parse(await readFile("docs/current-catalog.json", "utf8"));
if (!Number.isSafeInteger(data.places) || data.places < 1) throw new Error("Invalid catalog count");
const file = "docs/badges/places.svg";
const svg = await readFile(file, "utf8");
await writeFile(file, svg.replace(/aria-label="Места: \d+"/, 'aria-label="Места: '+data.places+'"').replace(/(<text x="72" y="14">)\d+(<\/text>)/, (_, a, b) => a + data.places + b));
