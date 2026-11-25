/**
 * Typed query documents and response models for the Product Hunt v2 GraphQL API.
 * Types are hand-written from the public API docs and only cover the fields the
 * tests rely on (deliberately narrow: a smaller surface means fewer false alarms).
 */

export type PostsOrder = "RANKING" | "NEWEST" | "VOTES" | "FEATURED_AT";

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface Connection<T> {
  totalCount?: number;
  pageInfo: PageInfo;
  edges: { cursor: string; node: T }[];
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
}

export interface UserSummary {
  id: string;
  name: string;
  username: string;
}

export interface Post {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  featuredAt: string | null;
  topics: { edges: { node: Topic }[] };
}

export interface PostWithMakers extends Post {
  user: UserSummary;
  makers: UserSummary[];
}

const POST_FIELDS = /* GraphQL */ `
  id
  name
  slug
  tagline
  url
  votesCount
  commentsCount
  createdAt
  featuredAt
  topics(first: 3) { edges { node { id name slug } } }
`;

export const POSTS_QUERY = /* GraphQL */ `
  query Posts($first: Int!, $after: String, $order: PostsOrder, $postedAfter: DateTime, $postedBefore: DateTime, $topic: String) {
    posts(first: $first, after: $after, order: $order, postedAfter: $postedAfter, postedBefore: $postedBefore, topic: $topic) {
      totalCount
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      edges { cursor node { ${POST_FIELDS} } }
    }
  }
`;
export interface PostsVars extends Record<string, unknown> {
  first: number;
  after?: string | null;
  order?: PostsOrder;
  postedAfter?: string;
  postedBefore?: string;
  topic?: string;
}
export interface PostsData {
  posts: Connection<Post>;
}

export const POST_BY_ID_OR_SLUG = /* GraphQL */ `
  query Post($id: ID, $slug: String) {
    post(id: $id, slug: $slug) {
      ${POST_FIELDS}
      user { id name username }
      makers { id name username }
    }
  }
`;
export interface PostVars extends Record<string, unknown> {
  id?: string;
  slug?: string;
}
export interface PostData {
  post: PostWithMakers | null;
}

/** Write operation used only to verify scope enforcement (it must be rejected). */
export const USER_FOLLOW_MUTATION = /* GraphQL */ `
  mutation Follow($userId: ID!) {
    userFollow(input: { userId: $userId }) { errors { field message } }
  }
`;
