# Product Hunt: Quality Ownership Take-home

Test strategy, exploratory findings, and automated E2E and API suites for [Product Hunt](https://www.producthunt.com) (web) and its [public GraphQL API v2](https://api.producthunt.com/v2/docs).

| Deliverable | Where |
|---|---|
| Part 1: Test strategy (1 page) | [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) |
| Part 2: Exploratory and security findings | [docs/FINDINGS.md](docs/FINDINGS.md) |
| Part 3: E2E suite (Playwright, 8 scenarios) | [tests/e2e/](tests/e2e/) |
| Part 3: API suite (Bun + TypeScript, 8 tests) | [tests/api/](tests/api/) |
| CI pipeline | [.github/workflows/ci.yml](.github/workflows/ci.yml) |

## Setup

Prerequisites: [Bun](https://bun.sh) 1.1 or later.

```bash
bun install
bunx playwright install chromium     # add --with-deps on Linux/CI
cp .env.example .env                 # then paste your developer token
```

To get a token, go to <https://www.producthunt.com/v2/oauth/applications>, create an application, and click **Create Token**. Put the **Developer Token** in `.env` as `PH_API_TOKEN=...`. The `.env` file is git-ignored.

## Running

```bash
bun run test:api        # API suite (bun:test)
bun run test:e2e        # E2E suite (Playwright, headless Chromium)
bun run test            # both
bun run typecheck       # tsc --noEmit over src, tests and config
bun run report          # open the last Playwright HTML report
```

- **Without a token**, the API suite runs the 2 unauthenticated tests (4 cases, since the forged-token test has 3 inputs) and **skips** the rest with an explicit skip, never a false pass.
- **E2E** needs no credentials.

## What's covered

### API: `tests/api/` (8 tests)

| # | Test | Why it's here (risk) |
|---|------|------|
| 1 | No token returns 401, `data: null`, a machine-readable error and secure transport headers | AuthN, the highest-risk area |
| 2 | Forged or malformed tokens (random, JWT `alg:none`, SQL-ish) are rejected without leaking internals | AuthN and information disclosure |
| 3 | A developer token can't run write mutations (`userFollow`, against a non-existent ID) | AuthZ and scope enforcement |
| 4 | `order: VOTES` is monotonic and honours the `postedAfter`/`postedBefore` window | Ranking integrity |
| 5 | Cursor pagination: page 2 continues page 1 with no overlap | API contract |
| 6 | `post(id)` = `post(slug)` = the list view entity; an unknown id returns `null`, not an error | Data consistency |
| 7 | Invalid GraphQL returns spec-compliant errors with no stack traces | Contract and info leakage |
| 8 | Rate-limit budget is exposed and decreases; an oversized `first: 1000` is bounded | Abuse resistance |

### E2E: `tests/e2e/` (8 scenarios)

| # | Scenario | Risk |
|---|----------|------|
| 1 | Home page renders today's leaderboard (at least 5 products) | Core funnel |
| 2 | Leaderboard to product detail (URL and `h1` match the clicked item) | Core funnel |
| 3 | Search for "notion" shows the result, which opens its product page | Discovery |
| 4 | Topic page lists products | Discovery and SEO |
| 5 | Historical daily leaderboard (fixed past date) is populated | Archive and SEO |
| 6 | Anonymous upvote leads to a sign-in prompt (asserted absent before the click) | **Vote integrity** |
| 7 | Product page has canonical, `og:title`, `og:image` and description | SEO and social sharing |
| 8 | Unknown product returns HTTP **404** and a recoverable not-found page | Error handling |

## Summary of findings

Full details, with repro steps and recommendations, are in [docs/FINDINGS.md](docs/FINDINGS.md).

- **Medium.** Bot protection is inconsistent. Direct loads of `/products/*` get a Cloudflare challenge, but the same pages load through in-app navigation. That means limited anti-scraping value and friction for visitors arriving from shared links.
- **Medium.** Search results are `<button>`s rather than links. You can't open them in a new tab, screen readers announce the wrong role (WCAG 4.1.2), and crawlers can't follow them.
- **Medium.** Auth and transport errors use `{error, error_description}` instead of the GraphQL-spec `message`, so standard clients show blank errors on auth failures.
- **Low.** Malformed JSON returns HTTP 400 with an empty body. HSTS declares `preload` with a 30-day `max-age` (preload needs a year). The 404 page has landmark and heading-order issues.
- **Info.** Wildcard CORS is acceptable for a bearer-token API. Several positive controls (auth rejection, no leaked internals, `nosniff`, rate-limit headers, real 404s) are documented.

## Architecture decisions

```
src/
  config.ts          typed env config (single source of truth)
  api/client.ts      ~80-line typed GraphQL client on native fetch, never throws on non-2xx
  api/queries.ts     query documents + narrow response types
tests/
  api/*.test.ts      bun:test suites, grouped by risk (auth / posts / resilience)
  e2e/
    fixtures.ts      extended Playwright `test`: page objects + consent handler + WAF header
    navigation.ts    visit(): navigation with explicit bot-challenge detection
    pages/*.ts       page objects (Home, Product, Search)
    *.spec.ts        scenarios
scripts/explore-web.ts   exploratory probe used for Part 2 (not part of CI)
```

- **No GraphQL client library.** A thin `fetch` wrapper keeps HTTP status, headers and timing visible to tests. Status, headers and timing are exactly what security and contract tests assert on, and heavier clients hide them or throw on them. Generics (`gql<TData, TVars>`) give typed variables and results.
- **Two error types are modelled** (`GraphQLError | PHTransportError`), because the API really returns both (finding F-A1).
- **Invariants, not snapshots.** Production data changes every minute, so tests assert ordering, pagination contracts, cross-query consistency and type shapes. Where stability matters, queries use fixed **historical date windows**, so votes are settled and results are deterministic.
- **Isolation.** Every test fetches its own data. There is no shared state or ordering dependency, so tests are parallel-safe.
- **Locators follow the accessibility tree.** E2E uses roles, accessible names and `href` patterns, not CSS classes, which are hashed and unstable on this site. A locator failure therefore often means a real a11y regression too (this is how F-W2 was found).
- **No sleeps.** Waiting relies only on web-first assertions (`expect`, `expect.poll`, `waitForURL`), and `addLocatorHandler` deals with consent banners whenever they appear.
- **Failure artefacts.** Traces, video and screenshots are retained on failure only. CI uses `retries: 1`, so a retried test is reported as *flaky* and never hidden. Workers are capped so the suite stays a polite client of production.
- **Write paths are tested only negatively.** Voting is asserted to be *gated*, never performed, and the mutation test targets a non-existent ID. No production data is created or changed.

### E2E and bot protection

`producthunt.com` is behind Cloudflare bot management, and some requests from automation get a managed challenge. This suite **does not attempt to evade it**: no stealth plugins, challenge solving or IP rotation. Instead:

1. `navigation.ts` detects the challenge page. The affected test is **skipped with a `blocked` annotation**, so a blocked run can't produce a false pass or a misleading red build.
2. `PH_E2E_EXTRA_HEADERS='{"x-qa-allow":"..."}'` (a CI secret) injects a WAF allowlist header that infra can grant to synthetic test traffic. That is the sanctioned way to run E2E against a protected production.
3. Product tests reach product pages **by clicking through the leaderboard**, the way real users do, because direct hard loads of `/products/*` are challenged more aggressively (finding F-W1). The tests use Playwright's standard `Desktop Chrome` device profile.

Local result at the time of writing: **8/8 passed on two consecutive runs.**

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`, and nightly:

- `typecheck`, then `api` and `e2e` in parallel, with JUnit and HTML reports uploaded as artefacts.
- Secrets: `PH_API_TOKEN` and, optionally, `PH_E2E_EXTRA_HEADERS`.

## What I'd do with more time

1. **Schema-drift guard.** Run a nightly introspection snapshot and diff it to catch breaking API changes before integrators do. Generate types with `graphql-codegen` instead of hand-writing them.
2. **Authenticated E2E in staging.** Seeded test users to cover voting, commenting, launching a product and notifications end to end, plus the OAuth authorization-code flow and token revocation.
3. **Security depth.** Query-depth and complexity tests with nested connections, field-suggestion leakage with introspection disabled, IDOR checks on private scopes with two test accounts, and a DAST pass (ZAP) against staging.
4. **Ranking integrity.** A web-vs-API consistency test comparing the daily leaderboard order on the page with `posts(order: RANKING)` for the same day.
5. **Non-functional.** `@axe-core/playwright` scans on the key pages, Lighthouse CI budgets, and load tests with k6 against staging only.
6. **Operational quality.** A flake dashboard (per-test pass rate from JUnit history), Playwright sharding as the suite grows, and synthetic production monitors with alerting tied to SLOs.
7. **Cross-browser and mobile.** Add WebKit, Firefox and a mobile viewport to the nightly matrix.
