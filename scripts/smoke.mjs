import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

const html = await readFile("dist/site/index.html");
const server = createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/shodi/") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const url of [
    "http://127.0.0.1:" + server.address().port + "/shodi/",
    pathToFileURL(resolve("dist/shodi.html")).href,
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /Content Security Policy|Refused to execute|Refused to apply/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(url);
    await page.locator("#guide-panel").waitFor({ state: "visible", timeout: 15000 });
    assert.ok(await page.locator(".place-add").count() > 0, "Catalog must contain places");
    await page.locator("#guide-city").fill("Кострома");
    await page.locator("#guide-city").press("Enter");
    await page.locator("#guide-city-name").filter({ hasText: "Кострома" }).waitFor();
    assert.ok(await page.locator(".place-add").count() > 0, "National catalog must load");
    await page.locator("#guide-target").selectOption("");
    await page.locator(".place-add").first().click();
    await page.locator("#open-guide-route").click();
    await page.locator("#active-route").waitFor({ state: "visible" });
    assert.equal(await page.locator("#stop-list .visit-toggle").count(), 1);
    await page.locator("#stop-list .visit-toggle").check();
    assert.equal(await page.locator("#route-progress").getAttribute("value"), "1");
    assert.deepEqual(errors, [], "Browser must not report script or CSP errors");
    await context.close();
    console.log("Browser smoke test passed:", url);
  }
} finally {
  await browser?.close();
  server.close();
}
