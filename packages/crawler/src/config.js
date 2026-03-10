// Configuration — loaded from environment variables

export function loadConfig() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TWITTER_BEARER_TOKEN'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
    targetListSlug: process.env.TARGET_LIST_SLUG || 'spam-bots',
    autoApproveThreshold: parseFloat(process.env.AUTO_APPROVE_THRESHOLD || '0.9'),
    reviewThreshold: parseFloat(process.env.REVIEW_THRESHOLD || '0.6'),
    scanLimit: parseInt(process.env.SCAN_LIMIT || '100', 10),
    dryRun: process.env.DRY_RUN === 'true',
  };
}
