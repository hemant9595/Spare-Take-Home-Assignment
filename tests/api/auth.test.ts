import { describe, expect, test } from "bun:test";
import { expectData, gql, type PHTransportError } from "../../src/api/client";
import {
  POSTS_QUERY,
  USER_BY_USERNAME,
  USER_FOLLOW_MUTATION,
  POST_MAKERS_QUERY,
  type PostMakersData,
  type PostsData,
  type PostsVars,
  type UserData,
  type UserFollowData,
} from "../../src/api/queries";
import { hasApiToken } from "../../src/config";

const minimalPosts: PostsVars = { first: 1 };
const REDACTED = "[REDACTED]";

describe("Authentication, authorization & privacy", () => {
  // 1
  test.each([
    ["no token", null],
    ["random string", "not-a-real-token"],
    ["JWT alg:none forgery", "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0."],
    ["SQL-ish payload", "' OR '1'='1"],
  ])("rejects %s with 401, no data, no leaked internals, secure headers", async (_label, token) => {
    const res = await gql<PostsData, PostsVars>(POSTS_QUERY, minimalPosts, { token });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    expect((res.body.errors?.[0] as PHTransportError).error).toBe("invalid_oauth_token");
    // No stack traces, framework names or SQL fragments in auth failures.
    expect(JSON.stringify(res.body)).not.toMatch(/backtrace|\.rb:\d+|ActiveRecord|SELECT |stack/i);
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  // 2
  test.skipIf(!hasApiToken)("public-scope token cannot perform write mutations (scope enforcement)", async () => {
    // Target ID "0" does not exist, so even a scope bug could not affect a real user.
    const res = await gql<UserFollowData, { userId: string }>(USER_FOLLOW_MUTATION, { userId: "0" });

    // Observed contract: HTTP 200 with a mutation-level `access_denied` (see FINDINGS F-A4).
    expect(res.status).toBe(200);
    expect(res.body.data?.userFollow.errors).toContainEqual({ field: "base", message: "access_denied" });
  });

  // 3 - KNOWN BUG (F-A5). `test.failing` passes while the bug exists and turns
  // red once it is fixed, prompting us to flip it to a regular regression test.
  // Assertions use counts/booleans only, so no personal data reaches CI logs.
  describe.skipIf(!hasApiToken)("privacy", () => {
    test.failing("user redaction is applied consistently: makers are redacted like user(username)", async () => {
      const post = expectData(
        await gql<PostMakersData, PostsVars>(POST_MAKERS_QUERY, {
          first: 1,
          order: "VOTES",
          postedAfter: "2024-01-01T00:00:00Z",
          postedBefore: "2024-01-08T00:00:00Z",
        }),
      ).posts.edges[0]!.node;

      // The direct user lookup IS redacted...
      const direct = expectData(
        await gql<UserData, { username: string }>(USER_BY_USERNAME, { username: post.makers[0]!.username }),
      );
      expect(direct.user?.username).toBe(REDACTED);

      // ...so the same people must not be exposed through post.makers.
      const exposedMakers = post.makers.filter((m) => m.username !== REDACTED).length;
      expect(exposedMakers).toBe(0);
    });
  });
});
