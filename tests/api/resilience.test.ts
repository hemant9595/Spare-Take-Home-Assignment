import { describe, expect, test } from "bun:test";
import { gql, type GraphQLError } from "../../src/api/client";
import { POSTS_QUERY, type PostsData, type PostsVars } from "../../src/api/queries";
import { hasApiToken } from "../../src/config";

describe.skipIf(!hasApiToken)("Error handling & abuse resistance", () => {
  // 7
  test("abusive query complexity is rejected with a spec-compliant error and no data", async () => {
    // Nested connections multiply cost (20x20x20...). The server must refuse to execute it.
    const res = await gql<unknown>(
      `{ posts(first: 20) { edges { node { comments(first: 20) { edges { node {
           replies(first: 20) { edges { node { id } } } } } } } } } }`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data ?? null).toBeNull();
    const errors = res.body.errors as GraphQLError[];
    expect(errors[0]!.message).toMatch(/complexity of \d+, which exceeds max complexity of \d+/);
    expect(JSON.stringify(res.body)).not.toMatch(/\.rb:\d+|backtrace/i);
  });

  // 8
  test("rate-limit budget is exposed, decreases per call, and page size is capped at 20", async () => {
    const r1 = await gql<PostsData, PostsVars>(POSTS_QUERY, { first: 1 });
    // A single oversized request (not a flood), selecting only ids so complexity
    // stays under the limit and we observe the page-size cap itself.
    const r2 = await gql<{ posts: { edges: { node: { id: string } }[] } }, { first: number }>(
      `query Ids($first: Int!) { posts(first: $first) { edges { node { id } } } }`,
      { first: 1000 },
    );

    expect(r1.rateLimit.limit).toBeGreaterThan(0);
    expect(r1.rateLimit.remaining).not.toBeNull();
    expect(r1.rateLimit.resetInSeconds).toBeGreaterThan(0);
    expect(r2.rateLimit.remaining!).toBeLessThan(r1.rateLimit.remaining!);

    // Observed contract: silently capped to 20, no error or warning (FINDINGS F-A6).
    expect(r2.status).toBe(200);
    expect(r2.body.data?.posts.edges.length).toBe(20);
  });
});
