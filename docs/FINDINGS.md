# Exploratory Testing & Security Assessment: Findings

**Scope:** `www.producthunt.com` (anonymous visitor) and the public GraphQL API `api.producthunt.com/v2/api/graphql`.
**Date:** 2026-11-25. **Method:** manual probing with curl, a headless Playwright probe (`scripts/explore-web.ts`), and the automated suites in this repo.
**Ethical bounds:** read-only requests, a single request per probe (no floods or fuzzing at volume), no attempts to evade Cloudflare, and no actions on other users' data. Write-scope checks target a non-existent ID (`"0"`).

Severity follows a simple scale: **High** means a security or data-integrity impact, **Medium** means user-facing or contract impact, **Low** means hygiene or polish, and **Info** means an observation or positive control.

## Summary

| ID | Area | Title | Severity |
|----|------|-------|----------|
| F-W1 | Web / Security | Bot protection is inconsistent: product pages are challenged on direct load but reachable via in-app navigation | Medium |
| F-W2 | Web / A11y / SEO | Search results are `<button>`s, not links | Medium |
| F-A1 | API / Contract | Auth and transport errors don't follow the GraphQL error spec | Medium |
| F-A2 | API | Malformed JSON returns HTTP 400 with an **empty body** | Low |
| F-S1 | Security headers | HSTS `preload` declared with a 30-day `max-age` (preload requires at least 1 year) | Low |
| F-W3 | Web / A11y | 404 page has no `<main>` landmark, and its `h2` precedes the `h1` | Low |
| F-A3 | API / Security | CORS `Access-Control-Allow-Origin: *` with an `Authorization` header allowed | Info |
| F-P1 | Positive controls | What works well | Info |

---

### F-W1: Bot protection is inconsistently applied to product pages (Medium)

**Observed.** With a standard Playwright Chromium profile, a direct `page.goto('/products/<real-slug>')` returns Cloudflare's managed challenge ("Just a moment...", HTTP 403). In the same session, all of the following load normally:

- the home page;
- `/topics/*`;
- `/leaderboard/daily/*`;
- a non-existent product slug, which returns a proper 404;
- the **same product page reached by clicking it on the leaderboard** (client-side navigation).

A bare headless browser (`HeadlessChrome` user agent) and `curl` are challenged on every page.

**Impact.**
1. *Security / anti-scraping:* the protection guards only the server-rendered entry point. The same product data is reachable through the app's client-side data fetching, so it gives limited protection against a determined scraper while adding friction for legitimate users.
2. *UX / growth:* product pages are the most shared links (social, newsletters). Visitors arriving on a **direct link** from privacy-hardened browsers, VPNs or in-app webviews are the ones most likely to hit an interstitial, which hurts launch-day conversion for makers.

**Repro.** `curl -s -o /dev/null -w "%{http_code}" https://www.producthunt.com/` returns `403`. In Playwright (see `tests/e2e/navigation.ts`), a direct load of a top product is challenged, while clicking the same product from `/` succeeds.

**Recommendation.** Align the WAF rules for page loads and data endpoints. Monitor the challenge-solve rate for `/products/*`. Give QA a sanctioned allowlist header for synthetic tests (supported in this repo via `PH_E2E_EXTRA_HEADERS`).

### F-W2: Search results are buttons, not links (Medium)

**Observed.** On `/search?q=notion`, each result is a `role=button` whose accessible name concatenates the name, tagline and review count, for example *"Notion Notion The all-in-one workspace 1.4K reviews"*. Clicking it navigates to `/products/notion`.

**Impact.**
- Users can't open a result in a new tab (middle-click or Cmd-click) or copy its link.
- Screen readers announce an action ("button") for what is really a navigation (WCAG 4.1.2, Name/Role/Value).
- The duplicated name (product name repeated) adds noise for assistive technology.
- Crawlers can't follow search-result links.

**Recommendation.** Render results as `<a href="/products/...">` and give each a concise accessible name.

### F-A1: Transport-level errors are not GraphQL-spec compliant (Medium)

**Observed.** Execution and validation errors use the standard `{ "errors": [{ "message", "locations" }] }` shape. Auth and request errors use a different one:

```json
{"data":null,"errors":[{"error":"invalid_oauth_token","error_description":"Please supply a valid access token..."}]}
```

The same non-standard shape is used for a missing query (`query_missing`, HTTP 400).

**Impact.** Standard GraphQL clients (Apollo, urql, graphql-request) read `errors[].message`. Here it is `undefined`, so integrators see blank or "unknown" errors exactly when they misconfigure auth, which is the most common integration failure. The typed client in this repo has to model two error shapes (`GraphQLError | PHTransportError`).

**Recommendation.** Keep `error` as an `extensions.code` and add a `message`, for example `{ "message": "...", "extensions": { "code": "invalid_oauth_token" } }`.

### F-A2: Malformed JSON returns 400 with an empty body (Low)

**Observed.** A `POST` with body `{bad` returns `HTTP 400` and **zero bytes** in the response. Every other 4xx from the endpoint returns a JSON error body.

**Impact.** It's inconsistent, and clients can't tell a parse error apart from other 400s. **Recommendation:** return `{"errors":[{"message":"Invalid JSON","extensions":{"code":"bad_request"}}]}`.

### F-S1: HSTS `preload` with a 30-day max-age (Low)

**Observed.** Both `api.` and `www.producthunt.com` send `strict-transport-security: max-age=2592000; includeSubDomains; preload`. The HSTS preload list requires `max-age` of at least `31536000` (one year). With a 30-day value the `preload` token is ineffective, and first visits remain exposed to SSL-stripping until the browser has seen the header.

**Recommendation.** Set `max-age=31536000` (or more) and confirm the domain's status at hstspreload.org.

### F-W3: 404 page landmarks and heading order (Low)

**Observed.** The 404 page has no `<main>` landmark (content sits outside `main`), and it renders `h2 "404"` before `h1 "We seem to have lost this page"`. The HTTP status is correctly `404`.

**Impact.** Minor screen-reader navigation issue (WCAG 1.3.1). **Recommendation:** wrap the content in `<main>` and make the visual "404" decorative or part of the `h1`.

### F-A3: Wildcard CORS on the API (Info)

**Observed.** A preflight from `Origin: https://evil.example` gets `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: authorization,content-type`.

**Assessment.** This is acceptable for a bearer-token API, because no cookies are involved and `*` can't be combined with credentials. It does mean any site can make API calls with a token it holds, so tokens must never be embedded in front-end code. Worth stating explicitly in the API docs. `text/plain` bodies (a CSRF-style "simple request") are **not** parsed as GraphQL. Good.

### F-P1: Positive controls observed (Info)

- Missing, forged (JWT `alg:none`) and injection-style tokens all return **401** with no stack traces or framework details.
- `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN` and `referrer-policy` are set. `x-xss-protection: 0` follows current guidance.
- Rate-limit headers (`x-rate-limit-limit / -remaining / -reset`) are exposed via CORS for client back-off.
- An unknown product slug returns a real **HTTP 404** (not a soft 404), which is good for SEO.

---

## Pending: authenticated API exploration

These checks need a developer token (`PH_API_TOKEN`). They are automated in `tests/api/` and skip automatically without one:
- Scope enforcement: can a developer (read-only) token call `userFollow`?
- PII exposure in `user` and `makers` fields.
- `order: VOTES` ordering, date-filter boundaries, cursor pagination overlap.
- Page-size and complexity bounds (`first: 1000`) and rate-limit budget accounting.
