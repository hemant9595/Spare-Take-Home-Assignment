import { describe, expect, test } from "bun:test";
import { gql, type GraphQLError } from "../../src/api/client";
import { POSTS_QUERY, type PostsData, type PostsVars } from "../../src/api/queries";
import { hasApiToken } from "../../src/config";

describe.skipIf(!hasApiToken)("Error handling & abuse resistance", () => {
  // 7
  test("invalid GraphQL returns spec-compliant validation errors without leaking internals", async () => {
    const res = await gql<unknown>(`query { posts(first: 1) { edges { node { doesNotExist } } } }`);

    expect(res.status).toBe(200);
    const errors = res.body.errors as GraphQLError[];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/doesNotExist/);
    expect(errors[0]!.locations?.[0]?.line).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/\.rb:\d+|backtrace/i);
  });

  // 8
  test("rate-limit budget is exposed, decreases per call, and oversized pages are bounded", async () => {
    const r1 = await gql<PostsData, PostsVars>(POSTS_QUERY, { first: 1 });
    // A single oversized request (not a flood): the server must cap or reject it.
    const r2 = await gql<PostsData, PostsVars>(POSTS_QUERY, { first: 1000 });

    expect(r1.rateLimit.limit).toBeGreaterThan(0);
    expect(r1.rateLimit.remaining).not.toBeNull();
    expect(r1.rateLimit.resetInSeconds).toBeGreaterThan(0);
    expect(r2.rateLimit.remaining!).toBeLessThan(r1.rateLimit.remaining!);

    const returned = r2.body.data?.posts.edges.length ?? 0;
    const rejected = (r2.body.errors?.length ?? 0) > 0;
    expect(rejected || returned <= 100).toBe(true);
  });
});
