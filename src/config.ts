/**
 * Central, typed configuration. Bun loads `.env` automatically; Playwright
 * (running under Node) gets it via `dotenv` in playwright.config.ts.
 */
export const config = {
  apiUrl: process.env.PH_API_URL ?? "https://api.producthunt.com/v2/api/graphql",
  webUrl: process.env.PH_WEB_URL ?? "https://www.producthunt.com",
  apiToken: process.env.PH_API_TOKEN ?? "",
} as const;

export const hasApiToken = config.apiToken.trim().length > 0;
