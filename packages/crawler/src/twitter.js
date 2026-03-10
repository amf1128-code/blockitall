// Twitter client — scraper-first approach with API fallback.
// Uses twitter-scraper with account login (guest tokens no longer work).
// Falls back to the official API v2 when a bearer token is available.

/**
 * TwitterClient wraps both scraping and API-based access to Twitter.
 *
 * The scraper requires Twitter account credentials (username + password)
 * since X/Twitter disabled guest token access in 2024.
 *
 * The official API is used as a fallback for rate-limited or failed scrapes.
 */
export class TwitterClient {
  constructor({ bearerToken = null, twitterUsername = null, twitterPassword = null, delayMs = 3000 } = {}) {
    this.bearerToken = bearerToken;
    this.twitterUsername = twitterUsername;
    this.twitterPassword = twitterPassword;
    this.delayMs = delayMs;
    this.requestCount = 0;
    this._scraper = null;
    this._loggedIn = false;
  }

  /**
   * Lazy-init the scraper with login.
   * X/Twitter killed guest tokens — the scraper must log in with
   * real credentials to access profiles, followers, and tweets.
   */
  async _getScraper() {
    if (this._scraper && this._loggedIn) return this._scraper;
    const { Scraper } = await import('@the-convocation/twitter-scraper');
    this._scraper = new Scraper();

    if (this.twitterUsername && this.twitterPassword) {
      try {
        await this._scraper.login(this.twitterUsername, this.twitterPassword);
        this._loggedIn = true;
        console.log('  Scraper logged in successfully');
      } catch (err) {
        console.warn(`  Scraper login failed: ${err.message}`);
        console.warn('  Falling back to API-only mode');
      }
    } else {
      console.warn('  No Twitter credentials provided — scraper will not work.');
      console.warn('  Set TWITTER_USERNAME and TWITTER_PASSWORD in .env');
    }

    return this._scraper;
  }

  async _delay() {
    await new Promise(r => setTimeout(r, this.delayMs));
  }

  // ---------------------------------------------------------------------------
  // Graph crawling — get followers/following of a known spam account
  // ---------------------------------------------------------------------------

  /**
   * Get the profile of a user by handle.
   * Returns a normalized user object or null.
   */
  async getProfile(handle) {
    this.requestCount++;
    try {
      const scraper = await this._getScraper();
      const profile = await scraper.getProfile(handle);
      await this._delay();
      if (!profile) return null;
      return this._normalizeProfile(profile);
    } catch (err) {
      console.warn(`  Scraper getProfile failed for @${handle}: ${err.message}`);
      return this._apiGetProfile(handle);
    }
  }

  /**
   * Get followers of a user (up to `limit`).
   * These are accounts that follow the target — for spam rings, other bots
   * follow each other to appear legitimate.
   */
  async getFollowers(userId, limit = 100) {
    this.requestCount++;
    try {
      const scraper = await this._getScraper();
      const followers = [];
      for await (const profile of scraper.getFollowers(userId, limit)) {
        followers.push(this._normalizeProfile(profile));
        if (followers.length >= limit) break;
      }
      await this._delay();
      return followers;
    } catch (err) {
      console.warn(`  Scraper getFollowers failed for ${userId}: ${err.message}`);
      return this._apiGetFollowers(userId, limit);
    }
  }

  /**
   * Get accounts that a user follows (up to `limit`).
   * Spam bots often follow other spam bots and a handful of big accounts.
   */
  async getFollowing(userId, limit = 100) {
    this.requestCount++;
    try {
      const scraper = await this._getScraper();
      const following = [];
      for await (const profile of scraper.getFollowing(userId, limit)) {
        following.push(this._normalizeProfile(profile));
        if (following.length >= limit) break;
      }
      await this._delay();
      return following;
    } catch (err) {
      console.warn(`  Scraper getFollowing failed for ${userId}: ${err.message}`);
      return this._apiGetFollowing(userId, limit);
    }
  }

  // ---------------------------------------------------------------------------
  // Reply scanning — find spam in replies to popular tweets
  // ---------------------------------------------------------------------------

  /**
   * Get recent tweets from a user (to find viral tweets worth scanning replies on).
   */
  async getUserTweets(handle, limit = 20) {
    this.requestCount++;
    try {
      const scraper = await this._getScraper();
      const tweets = [];
      for await (const tweet of scraper.getTweets(handle, limit)) {
        tweets.push(this._normalizeTweet(tweet));
        if (tweets.length >= limit) break;
      }
      await this._delay();
      return tweets;
    } catch (err) {
      console.warn(`  Scraper getUserTweets failed for @${handle}: ${err.message}`);
      return this._apiGetUserTweets(handle, limit);
    }
  }

  /**
   * Get replies/conversation thread for a specific tweet.
   * This is the key method for reply-spam detection — we scrape the reply
   * section of viral tweets and analyze each replier's profile.
   */
  async getTweetReplies(tweetId, limit = 100) {
    this.requestCount++;
    try {
      const scraper = await this._getScraper();
      const replies = [];
      // The scraper's search can find replies to a specific tweet
      const query = `conversation_id:${tweetId}`;
      for await (const tweet of scraper.searchTweets(query, limit, 'Latest')) {
        if (tweet.inReplyToStatusId === tweetId || tweet.conversationId === tweetId) {
          replies.push(this._normalizeTweet(tweet));
        }
        if (replies.length >= limit) break;
      }
      await this._delay();
      return replies;
    } catch (err) {
      console.warn(`  Scraper getTweetReplies failed for ${tweetId}: ${err.message}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Search — optional, used when enabled (subject to API filtering)
  // ---------------------------------------------------------------------------

  async searchTweets(query, limit = 50) {
    this.requestCount++;
    try {
      const scraper = await this._getScraper();
      const tweets = [];
      for await (const tweet of scraper.searchTweets(query, limit, 'Latest')) {
        tweets.push(this._normalizeTweet(tweet));
        if (tweets.length >= limit) break;
      }
      await this._delay();
      return tweets;
    } catch (err) {
      console.warn(`  Scraper search failed for "${query}": ${err.message}`);
      return this._apiSearch(query, limit);
    }
  }

  // ---------------------------------------------------------------------------
  // Normalization — convert scraper/API responses to a consistent shape
  // ---------------------------------------------------------------------------

  _normalizeProfile(profile) {
    return {
      id: profile.userId || profile.id || profile.id_str,
      username: (profile.username || profile.screen_name || '').toLowerCase(),
      name: profile.name || profile.displayName || '',
      description: profile.biography || profile.description || '',
      followersCount: profile.followersCount ?? profile.followers_count ?? 0,
      followingCount: profile.followingCount ?? profile.friends_count ?? 0,
      tweetCount: profile.statusesCount ?? profile.statuses_count ?? 0,
      createdAt: profile.joined || profile.created_at || null,
      verified: profile.isVerified ?? profile.verified ?? false,
      possiblySensitive: profile.possiblySensitive ?? profile.possibly_sensitive ?? false,
      profileImageUrl: profile.avatar || profile.profile_image_url || null,
    };
  }

  _normalizeTweet(tweet) {
    return {
      id: tweet.id || tweet.id_str,
      text: tweet.text || tweet.full_text || '',
      authorId: tweet.userId || tweet.author_id,
      authorHandle: (tweet.username || '').toLowerCase(),
      createdAt: tweet.timeParsed || tweet.created_at || null,
      inReplyToUserId: tweet.inReplyToStatusId ? (tweet.inReplyToUserId || null) : null,
      conversationId: tweet.conversationId || null,
      isReply: !!(tweet.inReplyToStatusId || tweet.in_reply_to_status_id),
      entities: tweet.entities || { urls: [] },
      likeCount: tweet.likes ?? tweet.favorite_count ?? 0,
      retweetCount: tweet.retweets ?? tweet.retweet_count ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // API v2 fallbacks (requires bearer token)
  // ---------------------------------------------------------------------------

  async _apiFetch(url) {
    if (!this.bearerToken) return null;
    this.requestCount++;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn('  API rate limited, skipping');
        return null;
      }
      throw new Error(`API ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  async _apiGetProfile(handle) {
    const data = await this._apiFetch(
      `https://api.twitter.com/2/users/by/username/${handle}?user.fields=description,public_metrics,created_at,verified`
    );
    if (!data?.data) return null;
    const u = data.data;
    return {
      id: u.id,
      username: u.username.toLowerCase(),
      name: u.name,
      description: u.description || '',
      followersCount: u.public_metrics?.followers_count ?? 0,
      followingCount: u.public_metrics?.following_count ?? 0,
      tweetCount: u.public_metrics?.tweet_count ?? 0,
      createdAt: u.created_at,
      verified: u.verified ?? false,
      possiblySensitive: false,
      profileImageUrl: null,
    };
  }

  async _apiGetFollowers(userId, limit) {
    const data = await this._apiFetch(
      `https://api.twitter.com/2/users/${userId}/followers?max_results=${Math.min(limit, 1000)}&user.fields=description,public_metrics,created_at`
    );
    if (!data?.data) return [];
    return data.data.map(u => ({
      id: u.id,
      username: u.username.toLowerCase(),
      name: u.name,
      description: u.description || '',
      followersCount: u.public_metrics?.followers_count ?? 0,
      followingCount: u.public_metrics?.following_count ?? 0,
      tweetCount: u.public_metrics?.tweet_count ?? 0,
      createdAt: u.created_at,
      verified: u.verified ?? false,
      possiblySensitive: false,
      profileImageUrl: null,
    }));
  }

  async _apiGetFollowing(userId, limit) {
    const data = await this._apiFetch(
      `https://api.twitter.com/2/users/${userId}/following?max_results=${Math.min(limit, 1000)}&user.fields=description,public_metrics,created_at`
    );
    if (!data?.data) return [];
    return data.data.map(u => ({
      id: u.id,
      username: u.username.toLowerCase(),
      name: u.name,
      description: u.description || '',
      followersCount: u.public_metrics?.followers_count ?? 0,
      followingCount: u.public_metrics?.following_count ?? 0,
      tweetCount: u.public_metrics?.tweet_count ?? 0,
      createdAt: u.created_at,
      verified: u.verified ?? false,
      possiblySensitive: false,
      profileImageUrl: null,
    }));
  }

  async _apiGetUserTweets(handle, limit) {
    // Need user ID first — skip if no bearer token
    if (!this.bearerToken) return [];
    const profile = await this._apiGetProfile(handle);
    if (!profile) return [];
    const data = await this._apiFetch(
      `https://api.twitter.com/2/users/${profile.id}/tweets?max_results=${Math.min(limit, 100)}&tweet.fields=entities,referenced_tweets,in_reply_to_user_id,conversation_id,public_metrics`
    );
    if (!data?.data) return [];
    return data.data.map(t => ({
      id: t.id,
      text: t.text || '',
      authorId: profile.id,
      authorHandle: profile.username,
      createdAt: t.created_at,
      inReplyToUserId: t.in_reply_to_user_id || null,
      conversationId: t.conversation_id || null,
      isReply: !!(t.in_reply_to_user_id || t.referenced_tweets?.some(r => r.type === 'replied_to')),
      entities: t.entities || { urls: [] },
      likeCount: t.public_metrics?.like_count ?? 0,
      retweetCount: t.public_metrics?.retweet_count ?? 0,
    }));
  }

  async _apiSearch(query, limit) {
    const data = await this._apiFetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${Math.min(limit, 100)}&tweet.fields=author_id,entities,referenced_tweets,in_reply_to_user_id,conversation_id&expansions=author_id&user.fields=description,public_metrics,created_at`
    );
    if (!data?.data) return [];
    return data.data.map(t => ({
      id: t.id,
      text: t.text || '',
      authorId: t.author_id,
      authorHandle: '',
      createdAt: t.created_at,
      inReplyToUserId: t.in_reply_to_user_id || null,
      conversationId: t.conversation_id || null,
      isReply: !!(t.in_reply_to_user_id),
      entities: t.entities || { urls: [] },
      likeCount: 0,
      retweetCount: 0,
    }));
  }
}
