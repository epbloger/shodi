import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const options = { absWorkingDir: root, bundle: true, minify: true, write: false, charset: "utf8", legalComments: "none" };
const [js, css] = await Promise.all([
  build({ ...options, entryPoints: ["public/app.js"], format: "iife" }),
  build({
    ...options, entryPoints: ["public/styles.css", "public/guide.css"], outdir: "dist",
    loader: { ".woff2": "dataurl", ".webp": "dataurl" },
  }),
]);

const script = js.outputFiles[0].text.trim().replace(/<\/script/gi, "<\\/script");
const style = css.outputFiles.map(file => file.text.trim()).join("\n");
const sha = value => "'sha256-" + createHash("sha256").update(value).digest("base64") + "'";
const containsTag = (source, expected, replacement) => {
  if (!source.includes(expected)) throw new Error("Missing page element: " + expected);
  return source.replace(expected, () => replacement);
};

let html = await readFile(root + "public/index.html", "utf8");
html = containsTag(html, '<link rel="stylesheet" href="./styles.css">', "<style>" + style + "</style>");
html = containsTag(html, '<link rel="stylesheet" href="./guide.css">', "");
html = containsTag(html, '<script type="module" src="./app.js"></script>', "");
html = containsTag(html, "</body>", "<script>" + script + "</script>\n</body>");
html = html.replace(
  /content="default-src 'none'; script-src [^"]+"/,
  'content="default-src \'none\'; script-src ' + sha(script) +
    "; style-src " + sha(style) + "; font-src data:; img-src data:; base-uri 'none'; form-action 'none'\"",
);
for (const [file, type] of [["icon.svg", "image/svg+xml"], ["embankment.webp", "image/webp"], ["city-guide.webp", "image/webp"]]) {
  const bytes = await readFile(root + "public/assets/" + file);
  html = containsTag(html, "./assets/" + file, "data:" + type + ";base64," + bytes.toString("base64"));
}
const licenses = await Promise.all(["manrope", "pt-serif", "yandex-reviews"].map(name =>
  readFile(root + "public/assets/" + name + "-license.txt", "utf8")));
html += "\n<!-- Font and data licenses\n" + licenses.join("\n") + "\n-->\n";
await mkdir(root + "dist", { recursive: true });
await writeFile(root + "dist/shodi.html", html);
console.log("dist/shodi.html");
