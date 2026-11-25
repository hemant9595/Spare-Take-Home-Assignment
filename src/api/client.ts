import { config } from "../config";

/** GraphQL spec-compliant error (graphql-ruby execution errors). */
export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

/**
 * Product Hunt's transport-level errors (auth, missing query) do NOT follow the
 * GraphQL spec: they use `error` / `error_description` instead of `message`.
 * See docs/FINDINGS.md (F-03).
 */
export interface PHTransportError {
  error: string;
  error_description: string;
}

export interface GraphQLResponse<TData> {
  data: TData | null;
  errors?: (GraphQLError | PHTransportError)[];
}

export interface RateLimit {
  limit: number | null;
  remaining: number | null;
  resetInSeconds: number | null;
}

export interface ApiResult<TData> {
  status: number;
  headers: Headers;
  body: GraphQLResponse<TData>;
  rateLimit: RateLimit;
  durationMs: number;
}

export interface RequestOptions {
  /** `null` sends no Authorization header at all. Defaults to the configured token. */
  token?: string | null;
  /** Extra headers, e.g. Origin for CORS checks. */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const toInt = (v: string | null): number | null => (v === null || v === "" ? null : Number.parseInt(v, 10));

/**
 * Minimal typed GraphQL client built on the runtime's native fetch.
 * It deliberately never throws on non-2xx: tests need to assert on status codes.
 */
export async function gql<TData, TVars extends Record<string, unknown> = Record<string, never>>(
  query: string,
  variables?: TVars,
  opts: RequestOptions = {},
): Promise<ApiResult<TData>> {
  const token = opts.token === undefined ? config.apiToken : opts.token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...opts.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const started = performance.now();
  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: variables ?? {} }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  const durationMs = performance.now() - started;

  const text = await res.text();
  let body: GraphQLResponse<TData>;
  try {
    body = JSON.parse(text) as GraphQLResponse<TData>;
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  return {
    status: res.status,
    headers: res.headers,
    body,
    durationMs,
    rateLimit: {
      limit: toInt(res.headers.get("x-rate-limit-limit")),
      remaining: toInt(res.headers.get("x-rate-limit-remaining")),
      resetInSeconds: toInt(res.headers.get("x-rate-limit-reset")),
    },
  };
}

/** Narrow helper: assert a successful GraphQL response and return typed data. */
export function expectData<TData>(result: ApiResult<TData>): TData {
  if (result.status !== 200 || !result.body.data || result.body.errors?.length) {
    throw new Error(
      `Expected successful GraphQL response, got HTTP ${result.status}: ${JSON.stringify(result.body.errors ?? result.body).slice(0, 500)}`,
    );
  }
  return result.body.data;
}
