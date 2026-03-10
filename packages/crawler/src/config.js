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

    // Target list in BlockItAll
    targetListSlug: process.env.TARGET_LIST_SLUG || 'spam-bots',

    // Scoring thresholds
    autoApproveThreshold: parseFloat(process.env.AUTO_APPROVE_THRESHOLD) || 0.9,
    reviewThreshold: parseFloat(process.env.REVIEW_THRESHOLD) || 0.6,

    // Crawl settings
    scanLimit: parseInt(process.env.SCAN_LIMIT, 10) || 200,
    maxDepth: parseInt(process.env.MAX_CRAWL_DEPTH, 10) || 2,       // how many hops from seed
    delayMs: parseInt(process.env.CRAWL_DELAY_MS, 10) || 3000,      // delay between requests
    replyPageSize: parseInt(process.env.REPLY_PAGE_SIZE, 10) || 100, // replies to scan per tweet

    // Seed accounts — known spam handles to start graph crawling from.
    // These are discovered manually or from community submissions.
    // The crawler will explore their followers/following to find more.
    // Default seeds are hardcoded; env var adds additional ones.
    seedAccounts: [
      'saifisntsafefw',
      'teamhojabiworld',
      'misslexa_ph',
      'vixly__',
      'livvyalex',
      'jasmine_baanks',
      'ruine_d0ll',
      'gooneddummy',
      ...parseSeedAccounts(process.env.SEED_ACCOUNTS),
    ],

    // Viral tweet accounts to monitor replies on (e.g. big accounts that attract spam)
    replyTargetAccounts: parseList(process.env.REPLY_TARGET_ACCOUNTS) || [
      'elonmusk', 'taylorswift13', 'BillGates', 'TheRock',
      'Cristiano', 'katyperry', 'rabornjason',
    ],

    // Mode flags
    dryRun: process.env.DRY_RUN === 'true',
    enableGraphCrawl: process.env.ENABLE_GRAPH_CRAWL !== 'false',   // on by default
    enableReplyScan: process.env.ENABLE_REPLY_SCAN !== 'false',     // on by default
    enableSearch: process.env.ENABLE_SEARCH === 'true',             // off by default (API limits)
  };
}

function requiredEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function parseList(val) {
  if (!val) return null;
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

function parseSeedAccounts(val) {
  if (!val) return [];
  return val.split(',').map(s => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
}
