/**
 * Exchange an application's API Key/Secret for a public-scope access token
 * (OAuth2 client-credentials grant) and append it to .env as PH_API_TOKEN.
 * The token is never printed.
 *
 * Usage: set PH_CLIENT_ID and PH_CLIENT_SECRET in .env, then `bun scripts/get-token.ts`
 */
import { appendFileSync, readFileSync } from "node:fs";

const clientId = process.env.PH_CLIENT_ID;
const clientSecret = process.env.PH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set PH_CLIENT_ID and PH_CLIENT_SECRET in .env first.");
  process.exit(1);
}
if (/^PH_API_TOKEN=.+/m.test(readFileSync(".env", "utf8"))) {
  console.log("PH_API_TOKEN already present in .env; nothing to do.");
  process.exit(0);
}

const res = await fetch("https://api.producthunt.com/v2/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
});
const body = (await res.json()) as { access_token?: string; scope?: string; error?: string };
if (!res.ok || !body.access_token) {
  console.error(`Token exchange failed (HTTP ${res.status}): ${body.error ?? "unknown error"}`);
  process.exit(1);
}

appendFileSync(".env", `\nPH_API_TOKEN=${body.access_token}\n`);
console.log(`Saved PH_API_TOKEN to .env (scope: ${body.scope}).`);
