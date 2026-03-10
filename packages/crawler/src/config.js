// Configuration for the BlockItAll crawler.
// Loads from environment variables with sensible defaults.

export function loadConfig() {
  return {
    // Supabase
    supabaseUrl: requiredEnv('SUPABASE_URL'),
    supabaseKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),

    // Twitter cookie-based auth (recommended — bypasses anti-bot login protection)
    twitterAuthToken: process.env.TWITTER_AUTH_TOKEN || null,
    twitterCt0: process.env.TWITTER_CT0 || null,

    // Twitter credentials for scraper login (fallback if cookies not set)
    twitterUsername: process.env.TWITTER_USERNAME || null,
    twitterPassword: process.env.TWITTER_PASSWORD || null,

    // Twitter API (optional — used as fallback when scraping fails)
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || null,

    // Crawler identity — the Supabase auth user ID that owns crawler-created records.
    // This must be a valid user in auth.users (e.g. your admin account).
    crawlerUserId: requiredEnv('CRAWLER_USER_ID'),

    // Target list in BlockItAll
    targetListSlug: process.env.TARGET_LIST_SLUG || 'spam-bots',

    // Scoring thresholds
    autoApproveThreshold: parseFloat(process.env.AUTO_APPROVE_THRESHOLD) || 0.75,
    reviewThreshold: parseFloat(process.env.REVIEW_THRESHOLD) || 0.4,

    // Crawl settings
    scanLimit: parseInt(process.env.SCAN_LIMIT, 10) || 500,
    delayMs: parseInt(process.env.CRAWL_DELAY_MS, 10) || 1500,

    // Network expansion — try to crawl following lists of confirmed bots.
    // This uses getFollowing which has intermittent 404s (Twitter rotates
    // GraphQL hashes). Enabled by default but fails gracefully.
    enableNetworkExpansion: process.env.ENABLE_NETWORK_EXPANSION !== 'false',

    // Mode flags
    dryRun: process.env.DRY_RUN === 'true',
  };
}

function requiredEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}
