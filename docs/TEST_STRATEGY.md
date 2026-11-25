# Test Strategy: Product Hunt (web + public GraphQL API v2)

**Context.** Product Hunt is a discovery platform: makers launch products, the community upvotes and comments, and a daily leaderboard ranks launches. Revenue and trust depend on two things: **the ranking is fair** and **content is discoverable**. Third parties build on the public GraphQL API, so it is a contract with external developers.

## What matters most (risk-ranked)

| # | Risk | Why it matters | Primary coverage |
|---|------|----------------|------------------|
| 1 | **AuthN/AuthZ and data exposure** (API tokens, OAuth scopes, PII in API responses, private-scope mutations) | A leak or privilege bug is a security incident and a legal issue (GDPR). Highest blast radius. | API negative tests, security headers and CORS checks, exploratory security review |
| 2 | **Ranking and vote integrity** (daily leaderboard order, vote counts, featured flag) | The core value proposition. Wrong ordering or manipulable votes destroy trust with makers. | API ordering invariants (`order: VOTES` is monotonic), consistency between web and API |
| 3 | **Discovery journeys on web** (home leaderboard → product page, search, topics, launch archive) | The anonymous visitor funnel is where most traffic arrives, largely from SEO. | Playwright E2E smoke on critical paths |
| 4 | **API contract stability** (schema shape, pagination, error format, rate limiting) | Breaking changes break every integrator silently. | Typed contract tests, pagination invariants, error-shape assertions |
| 5 | **Resilience and abuse** (query complexity limits, rate limiting, bot protection) | GraphQL makes expensive queries cheap to send, so DoS and scraping protection is essential. | Complexity and rate-limit tests (low volume only), header checks |
| 6 | Performance, SEO and accessibility | They drive acquisition, but the risk is lower than the items above. | Lighthouse/axe in CI (future), monitoring |

## Approach

- **Test pyramid, weighted towards the API.** Most logic is verified at the API layer, which is fast, deterministic and cheap. E2E covers only a few critical user journeys, through stable, user-facing locators (roles and URLs, not CSS).
- **Live data is non-deterministic.** Products, votes and rankings change every minute, so tests assert **invariants** (ordering, types, pagination contracts, cross-field consistency) and never literal values.
- **Contract and security are first-class.** Every response is typed. Negative auth tests and response-header checks run on every PR.
- **Ethical boundaries.** Read-only tests against production, minimal request volume, no attempts to bypass Cloudflare or rate limits, and no actions on other users' data.

## Environments and CI

- **On PR:** API suite plus E2E smoke (Chromium, headless), retries=1 on CI only, traces kept on failure.
- **Nightly:** full suite across browsers, and a schema-diff job (introspection snapshot) to catch breaking API changes.
- **Production:** synthetic monitors for the top journeys and API health. Alert on error budget, not on a single failure.

## Out of scope (for now) and why

- Write flows (posting, voting, commenting) need real accounts and would pollute production. They need a staging environment and seeded test users.
- Load testing production is not ethical, so it would run in staging with an agreed budget.

## Exit criteria and quality signals

No open P0/P1 security or ranking bugs. The API contract suite is green. E2E flake rate stays under 1% (tracked per test). Every escaped defect gets a regression test.
