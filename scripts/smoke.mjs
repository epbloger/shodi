import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";

const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp" };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname.replace(/^\/shodi\//, "/");
    const root = resolve("dist/site");
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + "/")) { res.writeHead(404).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const url of process.env.SHODI_PUBLIC_URL ? [process.env.SHODI_PUBLIC_URL] : [
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
    if (process.env.SHODI_PUBLIC_URL) {
      const expected = process.env.GITHUB_SHA;
      let ready = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const probe = new URL(url);
        probe.searchParams.set("verify", expected + "-" + attempt);
        try {
          const response = await page.goto(probe.href, { waitUntil: "domcontentloaded", timeout: 20000 });
          const revision = await page.locator('meta[name="shodi-revision"]').getAttribute("content", { timeout: 3000 });
          if (response?.ok() && revision === expected) { ready = true; break; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      assert.ok(ready, "Public site did not serve the deployed revision");
      errors.length = 0;
    }
    await page.goto(url, { waitUntil: "load" });
    if (process.env.SHODI_PUBLIC_URL) {
      assert.equal(await page.locator('meta[name="shodi-revision"]').getAttribute("content", { timeout: 5000 }), process.env.GITHUB_SHA, "Canonical URL must serve the new revision");
    }
    assert.equal(await page.locator("#guide-city").evaluate(el => el.tagName), "INPUT");
    assert.ok(await page.locator("#guide-city").evaluate(el => getComputedStyle(el).fontFamily.includes("Manrope")), "Application stylesheet must load");
    await page.locator("#startup-notice").waitFor({ state: "hidden" });
    assert.ok(await page.locator("#city-options option").count() >= 1100, "Full city list must load");
    await page.locator("#guide-panel").waitFor({ state: "visible", timeout: 15000 });
    assert.ok(await page.locator(".place-add").count() > 0, "Catalog must contain places");
    const initialTheme = await page.locator("html").getAttribute("data-theme");
    const nextTheme = initialTheme === "dark" ? "light" : "dark";
    const originalBackground = await page.locator("html").evaluate(el => getComputedStyle(el).backgroundColor);
    await page.locator("#theme-toggle").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), nextTheme);
    assert.notEqual(await page.locator("html").evaluate(el => getComputedStyle(el).backgroundColor), originalBackground);
    const themeSaved = await page.evaluate(() => { try { return localStorage.getItem("shodi/theme/v1"); } catch { return null; } });
    if (themeSaved === nextTheme) {
      await page.reload();
      await page.locator("#guide-panel").waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("data-theme"), nextTheme);
    }
    await page.locator("#theme-toggle").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), initialTheme);
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
    await page.locator(".remove-stop").click();
    await page.locator("#delete-dialog").waitFor({ state: "visible" });
    await page.locator('#delete-form button[value="cancel"]').click();
    await page.locator("#delete-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#stop-list .stop").count(), 1);
    await page.locator(".remove-stop").click();
    await page.locator('#delete-form button[value="confirm"]').click();
    await page.locator("#no-stops").waitFor({ state: "visible" });
    assert.equal(await page.locator("#stop-list .stop").count(), 0);
    const count = await page.locator("#route-list .route-link").count();
    await page.locator("#remove-route").click();
    await page.locator('#delete-form button[value="cancel"]').click();
    await page.locator("#delete-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#route-list .route-link").count(), count);
    await page.locator("#remove-route").click();
    await page.locator('#delete-form button[value="confirm"]').click();
    await page.waitForFunction(expected => document.querySelectorAll("#route-list .route-link").length === expected, count - 1);
    assert.deepEqual(errors, [], "Browser must not report script or CSP errors");
    await context.close();
    console.log("Browser smoke test passed:", url);
  }
} finally {
  await browser?.close();
  server.close();
}
