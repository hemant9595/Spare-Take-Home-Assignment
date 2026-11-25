import { describe, expect, test } from "bun:test";
import { expectData, gql } from "../../src/api/client";
import {
  POST_BY_ID_OR_SLUG,
  POSTS_QUERY,
  type Post,
  type PostData,
  type PostsData,
  type PostsVars,
  type PostVars,
} from "../../src/api/queries";
import { hasApiToken } from "../../src/config";

/**
 * Live production data changes constantly, so these tests assert invariants
 * (ordering, pagination contracts, cross-query consistency), not literal values.
 * Historical, fixed date windows are used wherever stability matters.
 * Every test fetches its own data: no shared state, any order, parallel-safe.
 */
const WINDOW = { postedAfter: "2024-01-01T00:00:00Z", postedBefore: "2024-01-08T00:00:00Z" } as const;

function assertPostShape(p: Post): void {
  expect(p.id).toMatch(/^\d+$/);
  expect(p.name.trim().length).toBeGreaterThan(0);
  expect(p.slug).toMatch(/^[a-z0-9-]+$/);
  expect(Number.isInteger(p.votesCount) && p.votesCount >= 0).toBe(true);
  expect(Number.isInteger(p.commentsCount) && p.commentsCount >= 0).toBe(true);
  expect(Number.isNaN(Date.parse(p.createdAt))).toBe(false);
  expect(() => new URL(p.url)).not.toThrow();
}

describe.skipIf(!hasApiToken)("Posts: contract & ranking invariants", () => {
  // 4
  test("order: VOTES is sorted by votes desc and honours the date window", async () => {
    const data = expectData(await gql<PostsData, PostsVars>(POSTS_QUERY, { first: 20, order: "VOTES", ...WINDOW }));
    const posts = data.posts.edges.map((e) => e.node);

    expect(posts.length).toBeGreaterThan(1);
    posts.forEach(assertPostShape);
    for (let i = 1; i < posts.length; i++) expect(posts[i]!.votesCount).toBeLessThanOrEqual(posts[i - 1]!.votesCount);
    for (const p of posts) {
      expect(Date.parse(p.createdAt)).toBeGreaterThanOrEqual(Date.parse(WINDOW.postedAfter));
      expect(Date.parse(p.createdAt)).toBeLessThan(Date.parse(WINDOW.postedBefore));
    }
  });

  // 5
  test("cursor pagination: page 2 continues page 1 with no overlap or duplicates", async () => {
    const base: PostsVars = { first: 5, order: "VOTES", ...WINDOW };
    const page1 = expectData(await gql<PostsData, PostsVars>(POSTS_QUERY, base)).posts;

    expect(page1.edges.length).toBe(5);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect(page1.pageInfo.endCursor).toBe(page1.edges.at(-1)!.cursor);

    const page2 = expectData(
      await gql<PostsData, PostsVars>(POSTS_QUERY, { ...base, after: page1.pageInfo.endCursor }),
    ).posts;
    const ids1 = new Set(page1.edges.map((e) => e.node.id));

    expect(page2.edges.length).toBeGreaterThan(0);
    expect(page2.edges.filter((e) => ids1.has(e.node.id))).toEqual([]);
    expect(page2.edges[0]!.node.votesCount).toBeLessThanOrEqual(page1.edges.at(-1)!.node.votesCount);
  });

  // 6
  test("post(id) and post(slug) resolve to the same entity as the list view; unknown ids return null", async () => {
    const listed = expectData(await gql<PostsData, PostsVars>(POSTS_QUERY, { first: 1, order: "VOTES", ...WINDOW }))
      .posts.edges[0]!.node;

    const [byId, bySlug, missing] = await Promise.all([
      gql<PostData, PostVars>(POST_BY_ID_OR_SLUG, { id: listed.id }),
      gql<PostData, PostVars>(POST_BY_ID_OR_SLUG, { slug: listed.slug }),
      gql<PostData, PostVars>(POST_BY_ID_OR_SLUG, { id: "999999999999" }),
    ]);

    for (const post of [expectData(byId).post!, expectData(bySlug).post!]) {
      expect({ id: post.id, name: post.name, slug: post.slug, tagline: post.tagline }).toEqual({
        id: listed.id,
        name: listed.name,
        slug: listed.slug,
        tagline: listed.tagline,
      });
    }
    expect(missing.status).toBe(200);
    expect(missing.body.data?.post).toBeNull();
  });
});
