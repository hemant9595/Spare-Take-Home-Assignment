import { describe, expect, test } from "bun:test";
import { gql, type PHTransportError } from "../../src/api/client";
import { POSTS_QUERY, USER_FOLLOW_MUTATION, type PostsData, type PostsVars } from "../../src/api/queries";
import { hasApiToken } from "../../src/config";

const minimalPosts: PostsVars = { first: 1 };

describe("Authentication & authorization", () => {
  // 1
  test("no token: 401, no data, machine-readable error, secure transport headers", async () => {
    const res = await gql<PostsData, PostsVars>(POSTS_QUERY, minimalPosts, { token: null });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    const err = res.body.errors?.[0] as PHTransportError;
    expect(err.error).toBe("invalid_oauth_token");
    expect(err.error_description).toBeString();

    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // 2
  test.each([
    ["random string", "not-a-real-token"],
    ["JWT alg:none forgery", "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0."],
    ["SQL-ish payload", "' OR '1'='1"],
  ])("forged/malformed token (%s) is rejected without leaking internals", async (_label, token) => {
    const res = await gql<PostsData, PostsVars>(POSTS_QUERY, minimalPosts, { token });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    // No stack traces, framework names or SQL fragments in auth failures.
    expect(JSON.stringify(res.body)).not.toMatch(/backtrace|\.rb:\d+|ActiveRecord|SELECT |stack/i);
  });

  // 3
  test.skipIf(!hasApiToken)("developer token cannot perform write mutations (scope enforcement)", async () => {
    // userFollow requires the `private` scope; a developer token should be read-only.
    // Target ID "0" does not exist, so even a scope bug cannot affect a real user.
    const res = await gql<unknown, { userId: string }>(USER_FOLLOW_MUTATION, { userId: "0" });

    const raw = JSON.stringify(res.body);
    const rejected = res.status === 401 || res.status === 403 || /scope|unauthori[sz]ed|forbidden|private/i.test(raw);
    expect(rejected).toBe(true);
  });
});
