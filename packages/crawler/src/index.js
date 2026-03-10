// Crawler entry point — discovers spam accounts via search and profile analysis.
//
// Discovery strategy (in priority order):
// 1. TWEET SEARCH: Search for tweets containing spam keywords/phrases.
//    Each tweet author becomes a candidate for analysis.
// 2. PROFILE SEARCH: Search for profiles with spam-pattern bios.
//    Directly finds accounts promoting adult/scam content.
// 3. NETWORK EXPANSION: When a confirmed bot is found, crawl who they
//    follow to find more bots in the same ring (best-effort, may 404).
//
// What works reliably with the twitter-scraper + cookie auth:
//   - searchTweets, searchProfiles, getProfile, getTweets
// What is broken (GraphQL hash rotation, known issue #165):
//   - getFollowers, getFollowing (intermittent 404s)

import 'dotenv/config';
import { loadConfig } from './config.js';
import { TwitterClient } from './twitter.js';
import { Database } from './db.js';
import {
  bioKeywords,
  displayNameSignals,
  linkAnalysis,
  tweetPatterns,
  replySpam,
  computeScore,
} from './detectors.js';

const stats = { added: 0, reviewed: 0, skipped: 0, alreadyKnown: 0, errors: 0 };

async function main() {
  const config = loadConfig();
  const twitter = new TwitterClient({
    bearerToken: config.twitterBearerToken,
    twitterUsername: config.twitterUsername,
    twitterPassword: config.twitterPassword,
    twitterCookies: config.twitterAuthToken ? { authToken: config.twitterAuthToken, ct0: config.twitterCt0 } : null,
    delayMs: config.delayMs,
  });
  const db = new Database(config.supabaseUrl, config.supabaseKey, config.crawlerUserId);

  console.log('BlockItAll Crawler');
  console.log(`Auth: cookies=${config.twitterAuthToken ? 'yes' : 'no'}, username=${config.twitterUsername ? 'yes' : 'no'}`);
  console.log(`Thresholds: auto=${config.autoApproveThreshold}, review=${config.reviewThreshold}`);
  console.log(`Scan limit: ${config.scanLimit}, delay: ${config.delayMs}ms`);
  if (config.dryRun) console.log('** DRY RUN — no database writes **');
  console.log('---');

  // Get or create the target list
  let listId;
  if (!config.dryRun) {
    listId = await db.getOrCreateList(
      config.targetListSlug,
      'Porn & OnlyFans Spam',
      'Automatically detected porn spam and OnlyFans bot accounts'
    );
  }

  // candidates: handle -> { profile, tweets }
  const candidates = new Map();

  // -------------------------------------------------------------------------
  // Phase 1: Tweet Search — find spam tweets, collect their authors
  // -------------------------------------------------------------------------
  console.log('\n=== Phase 1: Tweet Search ===');

  const tweetQueries = [
    'onlyfans link in bio',
    'fansly subscribe',
    'free nudes dm',
    'check my bio 18+',
    'mdni link',
    'findom paypig',
    'link in bio nsfw',
    'link in bio 🔞',
    'dm for the link onlyfans',
    'cum tribute dm',
    'full video in bio',
    'click my link 18+',
    'premium snap free',
    'subscribe to my onlyfans',
  ];

  for (const query of tweetQueries) {
    if (candidates.size >= config.scanLimit) break;

    console.log(`  Searching tweets: "${query}"...`);
    try {
      const tweets = await twitter.searchTweets(query, 30);
      let added = 0;

      for (const tweet of tweets) {
        const handle = tweet.authorHandle;
        if (!handle) continue;
        if (!candidates.has(handle)) {
          candidates.set(handle, { profile: null, tweets: [] });
          added++;
        }
        candidates.get(handle).tweets.push(tweet);
      }

      console.log(`    ${tweets.length} tweets, ${added} new authors`);
    } catch (err) {
      console.warn(`    Failed: ${err.message}`);
    }
  }

  console.log(`After tweet search: ${candidates.size} candidates`);

  // -------------------------------------------------------------------------
  // Phase 2: Profile Search — search for profiles with spam-pattern bios
  // -------------------------------------------------------------------------
  if (candidates.size < config.scanLimit) {
    console.log('\n=== Phase 2: Profile Search ===');

    const profileQueries = [
      'onlyfans link',
      'fansly 18+',
      'dm for collab nsfw',
      'findom goddess',
      'free trial onlyfans',
      'premium content 🔞',
      'subscribe fans',
      'adult content creator',
    ];

    for (const query of profileQueries) {
      if (candidates.size >= config.scanLimit) break;

      console.log(`  Searching profiles: "${query}"...`);
      try {
        const profiles = await twitter.searchProfiles(query, 30);
        let added = 0;

        for (const profile of profiles) {
          if (!profile.username || candidates.has(profile.username)) continue;
          candidates.set(profile.username, { profile, tweets: [] });
          added++;
        }

        console.log(`    ${profiles.length} profiles, ${added} new candidates`);
      } catch (err) {
        console.warn(`    Failed: ${err.message}`);
      }
    }

    console.log(`After profile search: ${candidates.size} candidates`);
  }

  // -------------------------------------------------------------------------
  // Phase 3: Network Expansion — crawl following lists of confirmed bots
  // (best-effort, getFollowing may 404 due to GraphQL hash rotation)
  // -------------------------------------------------------------------------
  // We'll do this after the analysis phase — only expand from confirmed bots.

  // -------------------------------------------------------------------------
  // Analysis — run detectors on all candidates
  // -------------------------------------------------------------------------
  console.log(`\n=== Analysis: ${candidates.size} candidates ===`);

  // Filter out accounts already in the database
  let existingHandles = new Set();
  const allHandles = [...candidates.keys()];
  if (!config.dryRun && allHandles.length > 0) {
    for (let i = 0; i < allHandles.length; i += 100) {
      const chunk = allHandles.slice(i, i + 100);
      const existing = await db.getExistingHandles(chunk);
      for (const h of existing) existingHandles.add(h);
    }
    console.log(`${existingHandles.size} already in database, skipping`);
  }

  // Track confirmed bots for network expansion
  const confirmedBots = [];

  for (const [handle, candidate] of candidates) {
    if (existingHandles.has(handle)) {
      stats.alreadyKnown++;
      continue;
    }

    // Fetch profile if we don't have it (found via tweet search)
    let profile = candidate.profile;
    if (!profile) {
      profile = await twitter.getProfile(handle);
      if (!profile) {
        stats.skipped++;
        continue;
      }
    }

    // Fetch tweets if we don't have enough
    let tweets = candidate.tweets || [];
    if (tweets.length < 5) {
      try {
        const fetched = await twitter.getUserTweets(handle, 20);
        tweets = [...tweets, ...fetched];
      } catch {
        // Non-fatal
      }
    }

    // Run all detectors
    const detectorResults = {
      bioKeywords: bioKeywords(profile),
      displayNameSignals: displayNameSignals(profile),
      linkAnalysis: linkAnalysis(profile, tweets),
      tweetPatterns: tweetPatterns(tweets),
      replySpam: replySpam(tweets),
    };

    const { score, reasons } = computeScore(detectorResults);

    if (score >= config.reviewThreshold) {
      const status = score >= config.autoApproveThreshold ? 'active' : 'under_review';
      const label = status === 'active' ? 'AUTO-BLOCK' : 'REVIEW';

      console.log(`[${label}] @${handle} (score: ${score.toFixed(2)}) — ${reasons.join('; ')}`);

      if (!config.dryRun) {
        try {
          await db.addDetectedAccount({
            handle,
            twitterId: profile.id,
            displayName: profile.name,
            score,
            reasons,
            status,
            detectorResults,
          }, listId);

          if (status === 'active') {
            stats.added++;
            confirmedBots.push({ handle, profile });
          } else {
            stats.reviewed++;
          }
        } catch (err) {
          console.error(`  DB error for @${handle}: ${err.message}`);
          stats.errors++;
        }
      } else {
        if (status === 'active') {
          stats.added++;
          confirmedBots.push({ handle, profile });
        } else {
          stats.reviewed++;
        }
      }
    } else {
      stats.skipped++;
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Network Expansion (best-effort)
  // -------------------------------------------------------------------------
  if (confirmedBots.length > 0 && config.enableNetworkExpansion) {
    console.log(`\n=== Phase 3: Network Expansion (${confirmedBots.length} confirmed bots) ===`);
    console.log('  (best-effort — getFollowing may 404 due to Twitter API changes)');

    const networkCandidates = new Map();

    for (const bot of confirmedBots.slice(0, 10)) {
      if (!bot.profile?.id) continue;

      try {
        const following = await twitter.getFollowing(bot.profile.id, 50);
        console.log(`  @${bot.handle} follows ${following.length} accounts`);

        for (const f of following) {
          if (!f.username || candidates.has(f.username) || existingHandles.has(f.username)) continue;
          if (!networkCandidates.has(f.username)) {
            networkCandidates.set(f.username, { profile: f, tweets: [] });
          }
        }
      } catch (err) {
        console.warn(`  getFollowing failed for @${bot.handle}: ${err.message}`);
        // Expected — getFollowing has intermittent 404s. Just skip.
        break; // If one fails, they'll all fail, don't waste time
      }
    }

    if (networkCandidates.size > 0) {
      console.log(`  Found ${networkCandidates.size} network candidates, analyzing...`);

      for (const [handle, candidate] of networkCandidates) {
        const profile = candidate.profile;
        let tweets = [];
        try {
          tweets = await twitter.getUserTweets(handle, 10);
        } catch { /* non-fatal */ }

        const detectorResults = {
          bioKeywords: bioKeywords(profile),
          displayNameSignals: displayNameSignals(profile),
          linkAnalysis: linkAnalysis(profile, tweets),
          tweetPatterns: tweetPatterns(tweets),
          replySpam: replySpam(tweets),
        };

        const { score, reasons } = computeScore(detectorResults);

        if (score >= config.reviewThreshold) {
          const status = score >= config.autoApproveThreshold ? 'active' : 'under_review';
          const label = status === 'active' ? 'AUTO-BLOCK' : 'REVIEW';

          console.log(`  [${label}] @${handle} (score: ${score.toFixed(2)}) — ${reasons.join('; ')}`);

          if (!config.dryRun) {
            try {
              await db.addDetectedAccount({
                handle,
                twitterId: profile.id,
                displayName: profile.name,
                score,
                reasons,
                status,
                detectorResults,
              }, listId);

              if (status === 'active') stats.added++;
              else stats.reviewed++;
            } catch (err) {
              console.error(`  DB error for @${handle}: ${err.message}`);
              stats.errors++;
            }
          } else {
            if (status === 'active') stats.added++;
            else stats.reviewed++;
          }
        } else {
          stats.skipped++;
        }
      }
    } else {
      console.log('  No network candidates found (getFollowing may be down)');
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n--- Results ---');
  console.log(`Auto-blocked: ${stats.added}`);
  console.log(`Sent to review: ${stats.reviewed}`);
  console.log(`Skipped (low score): ${stats.skipped}`);
  console.log(`Already known: ${stats.alreadyKnown}`);
  if (stats.errors > 0) console.log(`Errors: ${stats.errors}`);
  console.log(`Total API requests: ${twitter.requestCount}`);
}

main().catch(err => {
  console.error('Crawler failed:', err);
  process.exit(1);
});
