'use strict';

const crypto = require('crypto');
const { config } = require('../config');
const cacheService = require('./cacheService');
const logger = require('../utils/logger');

const GITHUB_API = 'https://api.github.com';

/** Thrown when we hit GitHub's primary rate limit and can't wait it out. */
class RateLimitError extends Error {
  constructor(message, resetEpochSeconds) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.resetAt = resetEpochSeconds
      ? new Date(resetEpochSeconds * 1000)
      : undefined;
  }
}

/** Thrown for any other non-OK GitHub response. */
class GitHubApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A wrapper around the GitHub REST API built on Node's native `fetch`.
 *
 * We hand-roll this (instead of using Octokit) because the whole point of
 * the project is to DEMONSTRATE these mechanics explicitly:
 *   • Caching:      conditional requests with ETags + a local cache.
 *   • Rate limits:  read the x-ratelimit headers and back off politely.
 *   • Pagination:   follow the Link header's rel="next" until exhausted.
 *
 * One client wraps one user's access token.
 */
class GitHubClient {
  constructor(token) {
    if (!token) throw new Error('GitHubClient requires an access token');
    this.token = token;
    // A short, non-reversible tag for this token. We prefix cache keys with
    // it so one user's cached "/user" response can never be served to
    // another user. (Public repo endpoints still cache fine per-user.)
    this.ns = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')
      .slice(0, 12);
    // Remember the most recent rate-limit numbers for observability.
    this.rateLimit = { remaining: null, limit: null, reset: null };
  }

  buildHeaders(extra = {}) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AnaGit-Dashboard',
      ...extra,
    };
  }

  /**
   * Perform a single request with caching + rate-limit handling.
   * Returns a normalized object: { data, status, link, etag, fromCache }.
   */
  async request(path, options = {}) {
    const {
      method = 'GET',
      body,
      useCache = method === 'GET',
      ttlSeconds = config.cache.ttlSeconds,
      retryOn202 = false, // GitHub "stats" endpoints reply 202 while computing
      maxRetries = 3,
    } = options;

    const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`;
    const cacheKey = `${this.ns}:${method}:${url}`;
    const headers = this.buildHeaders();

    // --- Caching: try to serve from cache / prepare a conditional request.
    let cached = null;
    if (useCache) {
      cached = await cacheService.get(cacheKey);
      if (cached) {
        const stillFresh = cached.freshUntil && new Date(cached.freshUntil) > new Date();
        if (stillFresh) {
          // Fresh hit — return immediately, zero network usage.
          return {
            data: cached.data,
            status: cached.status || 200,
            link: cached.link || null,
            etag: cached.etag || null,
            fromCache: true,
          };
        }
        // Stale but revalidatable: ask GitHub "has this changed since <etag>?"
        if (cached.etag) headers['If-None-Match'] = cached.etag;
      }
    }

    let attempt = 0;
    // Retry loop for 202 (stats computing), rate limits, and transient 5xx.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      this._recordRateLimit(res.headers);

      // --- 304 Not Modified: our cached copy is still valid (and this
      //     response did NOT cost us a rate-limit unit).
      if (res.status === 304 && cached) {
        await cacheService.touch(cacheKey, ttlSeconds);
        logger.debug(`cache revalidated (304): ${url}`);
        return {
          data: cached.data,
          status: 200,
          link: cached.link || null,
          etag: cached.etag || null,
          fromCache: true,
          notModified: true,
        };
      }

      // --- 202 Accepted: statistics are still being computed by GitHub.
      if (res.status === 202) {
        if (retryOn202 && attempt <= maxRetries) {
          const wait = 2000 * attempt;
          logger.debug(`GitHub computing stats (202), retrying in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        // Give up gracefully with empty data rather than throwing.
        return { data: [], status: 202, link: null, pending: true, fromCache: false };
      }

      // --- 204 No Content (e.g. empty language list): normalize to empty.
      if (res.status === 204) {
        return { data: null, status: 204, link: null, fromCache: false };
      }

      // --- Rate limiting (403/429).
      if (res.status === 403 || res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const remaining = Number(res.headers.get('x-ratelimit-remaining'));
        const reset = Number(res.headers.get('x-ratelimit-reset'));

        // Secondary/abuse limit — GitHub tells us exactly how long to wait.
        if (retryAfter && attempt <= maxRetries) {
          logger.warn(`Secondary rate limit; waiting ${retryAfter}s`);
          await sleep((retryAfter + 1) * 1000);
          continue;
        }

        // Primary limit exhausted — wait until the reset time if it's soon.
        if (remaining === 0 && reset) {
          const waitMs = Math.max(0, reset * 1000 - Date.now());
          if (waitMs <= config.sync.maxRateLimitWaitMs && attempt <= maxRetries) {
            logger.warn(
              `Rate limit reached; waiting ${Math.ceil(waitMs / 1000)}s until reset`
            );
            await sleep(waitMs + 1000);
            continue;
          }
          throw new RateLimitError(
            'GitHub API rate limit exceeded. Try again later.',
            reset
          );
        }
        // A 403 that isn't a rate limit (e.g. no access) falls through below.
      }

      // --- Transient server errors: retry with a short backoff.
      if (res.status >= 500 && attempt <= maxRetries) {
        const wait = 1000 * attempt;
        logger.warn(`GitHub ${res.status}; retrying in ${wait}ms`);
        await sleep(wait);
        continue;
      }

      // --- Clear, actionable auth error.
      if (res.status === 401) {
        throw new GitHubApiError(
          'GitHub authentication failed — the access token may be invalid or revoked. Please sign in again.',
          401
        );
      }

      // --- Any other non-OK response.
      if (!res.ok) {
        let msg;
        try {
          const errBody = await res.json();
          msg = errBody.message || res.statusText;
        } catch {
          msg = res.statusText;
        }
        throw new GitHubApiError(`GitHub API error (${res.status}): ${msg}`, res.status);
      }

      // --- Success. Parse, cache, and return.
      const data = await res.json();
      const link = res.headers.get('link');
      const etag = res.headers.get('etag');

      if (useCache && method === 'GET') {
        await cacheService.set(cacheKey, {
          data,
          etag,
          link,
          status: res.status,
          ttlSeconds,
        });
      }

      return { data, status: res.status, link, etag, fromCache: false };
    }
  }

  _recordRateLimit(headers) {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');
    if (remaining !== null) this.rateLimit.remaining = Number(remaining);
    if (limit !== null) this.rateLimit.limit = Number(limit);
    if (reset !== null) this.rateLimit.reset = Number(reset);
  }

  /**
   * Walk a paginated list endpoint, following the Link header until there
   * are no more "next" pages (or we hit the safety cap `maxPages`).
   * Returns the combined array of items.
   */
  async paginate(path, options = {}) {
    const {
      perPage = 100,
      maxPages = config.sync.maxPages,
      params = {},
      ...requestOptions
    } = options;

    const results = [];
    let page = 1;

    while (page <= maxPages) {
      const query = new URLSearchParams({
        ...params,
        per_page: String(perPage),
        page: String(page),
      }).toString();
      const sep = path.includes('?') ? '&' : '?';

      const { data, link } = await this.request(
        `${path}${sep}${query}`,
        requestOptions
      );

      if (!Array.isArray(data) || data.length === 0) break;
      results.push(...data);

      // The Link header is the source of truth for "is there another page?".
      const hasNext = link && link.includes('rel="next"');
      if (!hasNext) break;
      page += 1;
    }

    return results;
  }

  // --- Convenience wrappers for the endpoints we use ------------------

  async getAuthenticatedUser() {
    // Never cache the login lookup — we always want the live identity.
    const { data } = await this.request('/user', { useCache: false });
    return data;
  }

  async getUserRepos({ perPage = 100, maxPages = config.sync.maxPages } = {}) {
    // Repos the authenticated user can access, most recently pushed first.
    return this.paginate('/user/repos', {
      perPage,
      maxPages,
      params: { sort: 'pushed', affiliation: 'owner,collaborator,organization_member' },
    });
  }

  getRepo(fullName) {
    return this.request(`/repos/${fullName}`).then((r) => r.data);
  }

  getLanguages(fullName) {
    return this.request(`/repos/${fullName}/languages`).then((r) => r.data);
  }

  getIssues(fullName, { state = 'all' } = {}) {
    return this.paginate(`/repos/${fullName}/issues`, { params: { state } });
  }

  getCommits(fullName, { since } = {}) {
    const params = {};
    if (since) params.since = since;
    return this.paginate(`/repos/${fullName}/commits`, { params });
  }

  getWeeklyCommitActivity(fullName) {
    return this.request(`/repos/${fullName}/stats/commit_activity`, {
      retryOn202: true,
    }).then((r) => r.data);
  }

  getContributorStats(fullName) {
    return this.request(`/repos/${fullName}/stats/contributors`, {
      retryOn202: true,
    }).then((r) => r.data);
  }

  getRateLimit() {
    return this.request('/rate_limit', { useCache: false }).then((r) => r.data);
  }
}

module.exports = { GitHubClient, RateLimitError, GitHubApiError };
