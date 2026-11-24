import { writeFile } from "node:fs/promises";

const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(tag ?? "")) throw new Error("Expected a published version tag");
const width = 57 + Math.max(43, tag.length * 7 + 10);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="release: ${tag}"><rect width="${width}" height="20" rx="3" fill="#496780"/><path d="M3 0h54v20H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z" fill="#555"/><g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11"><text x="28.5" y="14">release</text><text x="${(57+width)/2}" y="14">${tag}</text></g></svg>\n`;
await writeFile("docs/release-badge.svg", svg);
