/**
 * Exploratory probe (not a test): loads key pages headlessly and records
 * status, title, security headers, console errors and failed requests.
 * Usage: bun scripts/explore-web.ts [path ...]
 */
import { chromium } from "@playwright/test";

const base = process.env.PH_WEB_URL ?? "https://www.producthunt.com";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/topics", "/search?q=notion", "/this-page-should-not-exist-qa"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "en-US" });

for (const path of paths) {
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
  page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url().slice(0, 120)}`));

  const res = await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load").catch(() => {});
  const h = res?.headers() ?? {};
  const title = await page.title();
  const challenged = /just a moment|attention required|cloudflare/i.test(title + (await page.content()).slice(0, 5000));

  console.log(JSON.stringify({
    path,
    status: res?.status(),
    finalUrl: page.url(),
    title,
    challenged,
    headers: {
      csp: h["content-security-policy"]?.slice(0, 120) ?? null,
      xfo: h["x-frame-options"] ?? null,
      hsts: h["strict-transport-security"] ?? null,
      referrer: h["referrer-policy"] ?? null,
      server: h["server"] ?? null,
      poweredBy: h["x-powered-by"] ?? null,
    },
    consoleErrors: consoleErrors.slice(0, 5),
    failed: failed.slice(0, 8),
  }, null, 2));
  await page.close();
}
await browser.close();
