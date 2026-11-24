import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const out = "dist/site";
await mkdir(out, { recursive: true });
// Retain original asset paths for visitors who still have an older cached page.
await cp("public", out, { recursive: true });
const opts = { bundle: true, minify: true, write: false, charset: "utf8", legalComments: "none" };
const [js, css] = await Promise.all([
  build({ ...opts, entryPoints: ["public/app.js"], format: "iife" }),
  build({ ...opts, entryPoints: ["public/styles.css", "public/guide.css"], outdir: "dist",
    loader: { ".woff2": "dataurl", ".webp": "dataurl" } }),
]);
const script = js.outputFiles[0].text;
const styles = css.outputFiles.map(file => file.text).join("\n");
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 16);
const jsName = "shodi-" + hash(script) + ".js";
const cssName = "shodi-" + hash(styles) + ".css";
let html = await readFile("public/index.html", "utf8");
html = html.replace('<link rel="stylesheet" href="./styles.css">', '<link rel="stylesheet" href="./' + cssName + '">')
  .replace('<link rel="stylesheet" href="./guide.css">', "")
  .replace('<script type="module" src="./app.js"></script>', '<script defer src="./' + jsName + '"></script>')
  .replace("font-src 'self'; img-src 'self';", "font-src 'self' data:; img-src 'self' data:;")
  .replace("</head>", '<meta name="shodi-revision" content="' + (process.env.GITHUB_SHA || "local") + '">\n</head>');
if (!html.includes(jsName) || !html.includes(cssName)) throw new Error("Missing bundled assets");
await Promise.all([
  writeFile(out + "/index.html", html),
  writeFile(out + "/" + jsName, script),
  writeFile(out + "/" + cssName, styles),
]);
console.log("Website built:", jsName, cssName);
