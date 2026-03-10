// Twitter API client — fetches user profiles and tweets for analysis

const BASE_URL = 'https://api.x.com/2';

export class TwitterClient {
  constructor(bearerToken) {
    this.bearerToken = bearerToken;
    this.requestCount = 0;
  }

  async fetch(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    this.requestCount++;

    const res = await globalThis.fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${this.bearerToken}` },
    });

    if (res.status === 429) {
      const resetAt = res.headers.get('x-rate-limit-reset');
      const waitMs = resetAt ? (parseInt(resetAt, 10) * 1000 - Date.now()) : 60_000;
      console.log(`Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, Math.max(waitMs, 1000)));
      return this.fetch(endpoint, params);
    }

    if (!res.ok) {
      throw new Error(`Twitter API error ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * Look up a user by handle. Returns user object with public metrics.
   */
  async getUser(handle) {
    const data = await this.fetch(`/users/by/username/${handle}`, {
      'user.fields': 'created_at,description,public_metrics,profile_image_url,verified',
    });
    return data.data || null;
  }

  /**
   * Look up multiple users by handle (max 100 per request).
   */
  async getUsers(handles) {
    if (handles.length === 0) return [];
    const data = await this.fetch('/users/by', {
      'usernames': handles.join(','),
      'user.fields': 'created_at,description,public_metrics,profile_image_url,verified',
    });
    return data.data || [];
  }

  /**
   * Get recent tweets from a user (max 100).
   */
  async getUserTweets(userId, maxResults = 20) {
    const data = await this.fetch(`/users/${userId}/tweets`, {
      'max_results': String(Math.min(maxResults, 100)),
      'tweet.fields': 'created_at,entities,public_metrics,source',
    });
    return data.data || [];
  }

  /**
   * Search recent tweets matching a query (last 7 days).
   */
  async searchRecentTweets(query, maxResults = 50) {
    const data = await this.fetch('/tweets/search/recent', {
      'query': query,
      'max_results': String(Math.min(maxResults, 100)),
      'tweet.fields': 'author_id,created_at,entities,public_metrics,source',
      'expansions': 'author_id',
      'user.fields': 'created_at,description,public_metrics,profile_image_url',
    });
    return {
      tweets: data.data || [],
      users: data.includes?.users || [],
    };
  }
}
