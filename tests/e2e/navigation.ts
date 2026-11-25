import { test, type Page, type Response } from "@playwright/test";

/**
 * producthunt.com sits behind Cloudflare bot management, and automated browsers
 * are often served a "Just a moment..." managed challenge (HTTP 403).
 *
 * We do NOT attempt to evade it (no stealth plugins, UA spoofing or challenge
 * solving). Instead:
 *  1. If the infra team provides a WAF allowlist header for test traffic, pass it
 *     via PH_E2E_EXTRA_HEADERS='{"x-qa-bypass":"..."}'. This is the standard,
 *     sanctioned approach for running E2E against a protected production.
 *  2. Otherwise, a challenged navigation SKIPS the test with an explicit annotation,
 *     so a blocked run never reports a false pass or a misleading failure.
 */
const CHALLENGE_TITLE = /just a moment|attention required/i;

export async function isBotChallenge(page: Page, res: Response | null): Promise<boolean> {
  if (res?.headers()["cf-mitigated"] === "challenge") return true;
  return CHALLENGE_TITLE.test(await page.title());
}

/** Navigate, and skip the current test if Cloudflare challenges the request. */
export async function visit(page: Page, path: string): Promise<Response | null> {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  if (await isBotChallenge(page, res)) {
    test.info().annotations.push({ type: "blocked", description: `Cloudflare challenge on ${path}` });
    test.skip(true, `Blocked by Cloudflare bot challenge on ${path} (see README > E2E & bot protection)`);
  }
  return res;
}
