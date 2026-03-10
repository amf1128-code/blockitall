// Crawler entry point — discovers spam accounts via graph crawling and reply scanning.
//
// Discovery strategy (in priority order):
// 1. GRAPH CRAWL: Start from known spam accounts (seeds), crawl their
//    followers/following to find bot rings. Bypasses search censorship entirely.
// 2. REPLY SCAN: Monitor replies on viral tweets from popular accounts.
//    Spam bots reply-bomb these tweets — we catch them in the act.
// 3. SEARCH (optional, off by default): Keyword search via scraper/API.
//    Subject to Twitter's content filtering but still catches obvious ones.

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

// Counters for the summary
const stats = { added: 0, reviewed: 0, skipped: 0, alreadyKnown: 0 };

async function main() {
  const config = loadConfig();
  const twitter = new TwitterClient({
    bearerToken: config.twitterBearerToken,
    twitterUsername: config.twitterUsername,
    twitterPassword: config.twitterPassword,
    delayMs: config.delayMs,
  });
  const db = new Database(config.supabaseUrl, config.supabaseKey);

  console.log('BlockItAll Crawler');
  console.log(`Target list: ${config.targetListSlug}`);
  console.log(`Thresholds: auto-approve=${config.autoApproveThreshold}, review=${config.reviewThreshold}`);
  console.log(`Scan limit: ${config.scanLimit}`);
  console.log(`Modes: graph=${config.enableGraphCrawl}, replies=${config.enableReplyScan}, search=${config.enableSearch}`);
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

  // Collect all candidate handles we've already seen (to avoid re-processing)
  let existingHandles = new Set();
  const candidates = new Map(); // handle -> { profile, tweets }

  // -------------------------------------------------------------------------
  // Phase 1: Graph Crawl — start from seed accounts, explore their network
  // -------------------------------------------------------------------------
  if (config.enableGraphCrawl) {
    console.log('\n=== Phase 1: Graph Crawl ===');

    // Build seed list: env-provided seeds + recent auto-blocked accounts from DB
    const seeds = [...config.seedAccounts];
    if (!config.dryRun) {
      const dbSeeds = await db.getSeedHandles(30);
      for (const s of dbSeeds) {
        if (!seeds.includes(s.handle)) seeds.push(s.handle);
      }
    }

    if (seeds.length === 0) {
      console.log('No seed accounts available. Set SEED_ACCOUNTS env var or run search mode first.');
    } else {
      console.log(`Starting from ${seeds.length} seed accounts`);

      // BFS crawl through the network
      const visited = new Set();
      const queue = seeds.map(handle => ({ handle, depth: 0 }));

      while (queue.length > 0 && candidates.size < config.scanLimit) {
        const { handle, depth } = queue.shift();
        if (visited.has(handle)) continue;
        visited.add(handle);

        console.log(`  Crawling @${handle} (depth ${depth})...`);

        // Get the profile
        const profile = await twitter.getProfile(handle);
        if (!profile) {
          console.log(`    Could not fetch profile, skipping`);
          continue;
        }

        // If this isn't already a known seed, add as candidate for analysis
        if (depth > 0 && !candidates.has(handle)) {
          candidates.set(handle, { profile, tweets: [] });
        }

        // Don't go deeper than maxDepth
        if (depth >= config.maxDepth) continue;

        // Get followers and following — these are the network to explore
        try {
          const followers = await twitter.getFollowers(profile.id, 50);
          console.log(`    Found ${followers.length} followers`);
          for (const f of followers) {
            if (!visited.has(f.username) && candidates.size + queue.length < config.scanLimit * 2) {
              // Quick pre-filter: only queue accounts that look suspicious from profile alone
              const quickScore = quickProfileCheck(f);
              if (quickScore > 0.3) {
                candidates.set(f.username, { profile: f, tweets: [] });
                queue.push({ handle: f.username, depth: depth + 1 });
              }
            }
          }
        } catch (err) {
          console.warn(`    Failed to get followers: ${err.message}`);
        }

        try {
          const following = await twitter.getFollowing(profile.id, 50);
          console.log(`    Found ${following.length} following`);
          for (const f of following) {
            if (!visited.has(f.username) && candidates.size + queue.length < config.scanLimit * 2) {
              const quickScore = quickProfileCheck(f);
              if (quickScore > 0.3) {
                candidates.set(f.username, { profile: f, tweets: [] });
                queue.push({ handle: f.username, depth: depth + 1 });
              }
            }
          }
        } catch (err) {
          console.warn(`    Failed to get following: ${err.message}`);
        }
      }

      console.log(`Graph crawl found ${candidates.size} candidates`);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: Reply Scan — scan replies on viral tweets for spam
  // -------------------------------------------------------------------------
  if (config.enableReplyScan && candidates.size < config.scanLimit) {
    console.log('\n=== Phase 2: Reply Scan ===');

    for (const targetHandle of config.replyTargetAccounts) {
      if (candidates.size >= config.scanLimit) break;

      console.log(`  Checking replies on @${targetHandle}'s recent tweets...`);

      try {
        // Get recent tweets from the target account
        const targetTweets = await twitter.getUserTweets(targetHandle, 5);

        // Find the most-engaged tweets (most likely to have spam replies)
        const sorted = targetTweets
          .filter(t => !t.isReply)
          .sort((a, b) => (b.likeCount + b.retweetCount) - (a.likeCount + a.retweetCount));

        // Scan replies on top 2 tweets
        for (const tweet of sorted.slice(0, 2)) {
          if (candidates.size >= config.scanLimit) break;

          console.log(`    Scanning replies on tweet ${tweet.id} (${tweet.likeCount} likes)...`);
          const replies = await twitter.getTweetReplies(tweet.id, config.replyPageSize);
          console.log(`    Found ${replies.length} replies`);

          // Collect unique repliers and their reply tweets
          for (const reply of replies) {
            const handle = reply.authorHandle;
            if (!handle || handle === targetHandle) continue;

            if (!candidates.has(handle)) {
              candidates.set(handle, { profile: null, tweets: [] });
            }
            candidates.get(handle).tweets.push(reply);
          }
        }
      } catch (err) {
        console.warn(`  Failed to scan @${targetHandle}: ${err.message}`);
      }
    }

    console.log(`After reply scan: ${candidates.size} total candidates`);
  }

  // -------------------------------------------------------------------------
  // Phase 3: Search (optional, off by default)
  // -------------------------------------------------------------------------
  if (config.enableSearch && candidates.size < config.scanLimit) {
    console.log('\n=== Phase 3: Search ===');

    const searchQueries = [
      'onlyfans link in bio -is:retweet',
      'fansly subscribe -is:retweet',
      'free nudes dm -is:retweet',
      'chudai video -is:retweet',
      'desi bhabhi sex -is:retweet',
      'cum tribute dm -is:retweet',
      'check my bio 18+ -is:retweet',
      'mdni link -is:retweet',
      'findom paypig -is:retweet',
      'link in bio nsfw -is:retweet',
      'link in bio 🔞 -is:retweet',
      'queen of spades ♠️ -is:retweet',
      'wataa video -is:retweet',
      'feet pics dm -is:retweet',
    ];

    for (const query of searchQueries) {
      if (candidates.size >= config.scanLimit) break;

      console.log(`  Searching: "${query}"...`);
      try {
        const tweets = await twitter.searchTweets(query, 50);

        for (const tweet of tweets) {
          const handle = tweet.authorHandle;
          if (!handle) continue;
          if (!candidates.has(handle)) {
            candidates.set(handle, { profile: null, tweets: [] });
          }
          candidates.get(handle).tweets.push(tweet);
        }
      } catch (err) {
        console.error(`  Search failed for "${query}": ${err.message}`);
      }
    }

    console.log(`After search: ${candidates.size} total candidates`);
  }

  // -------------------------------------------------------------------------
  // Analysis phase — run detectors on all candidates
  // -------------------------------------------------------------------------
  console.log(`\n=== Analysis: ${candidates.size} candidates ===`);

  // Filter out accounts already in the database
  const allHandles = [...candidates.keys()];
  if (!config.dryRun && allHandles.length > 0) {
    // Batch check in chunks of 100
    for (let i = 0; i < allHandles.length; i += 100) {
      const chunk = allHandles.slice(i, i + 100);
      const existing = await db.getExistingHandles(chunk);
      for (const h of existing) existingHandles.add(h);
    }
    console.log(`${existingHandles.size} already in database, skipping`);
  }

  for (const [handle, candidate] of candidates) {
    if (existingHandles.has(handle)) {
      stats.alreadyKnown++;
      continue;
    }

    // Fetch profile if we don't have it (e.g. found via reply scan)
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
        // Non-fatal — analyze with what we have
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

    // Determine action based on score
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

          if (status === 'active') stats.added++;
          else stats.reviewed++;
        } catch (err) {
          console.error(`  Failed to add @${handle}: ${err.message}`);
        }
      } else {
        if (status === 'active') stats.added++;
        else stats.reviewed++;
      }
    } else {
      stats.skipped++;
    }
  }

  console.log('\n--- Results ---');
  console.log(`Auto-blocked: ${stats.added}`);
  console.log(`Sent to review: ${stats.reviewed}`);
  console.log(`Skipped (low score): ${stats.skipped}`);
  console.log(`Already known: ${stats.alreadyKnown}`);
  console.log(`Total requests: ${twitter.requestCount}`);
}

/**
 * Quick pre-filter for graph crawl — checks profile fields only (no API calls).
 * Returns a rough score 0-1 to decide if an account is worth fully analyzing.
 * This avoids wasting API calls on obviously-clean accounts in the network.
 */
function quickProfileCheck(profile) {
  let signals = 0;

  const bio = (profile.description || '').toLowerCase();
  const name = (profile.name || '').toLowerCase();

  // Bio keyword check (simplified — just check a few strong signals)
  const strongSignals = [
    'onlyfans', 'fansly', 'link in bio', 'mdni', 'dm me', '18+',
    'nsfw', 'findom', 'free nudes', 'subscribe', 'premium',
    'chudai', 'wataa', 'bhabhi', 'desi sex',
  ];
  if (strongSignals.some(kw => bio.includes(kw))) signals += 2;

  // Name keyword check
  if (strongSignals.some(kw => name.includes(kw))) signals += 2;

  // Sensitive flag from Twitter
  if (profile.possiblySensitive) signals += 1;

  // Spam emoji in bio or name
  const spamEmoji = ['🔞', '♠️', '🍑', '🍆', '💦'];
  const fullText = (profile.description || '') + (profile.name || '');
  if (spamEmoji.some(e => fullText.includes(e))) signals += 1;

  // Suspicious follower ratios (new account farming)
  if (profile.followingCount > 0 && profile.followersCount > 0) {
    const ratio = profile.followingCount / profile.followersCount;
    if (ratio > 10) signals += 1; // following way more than followers
  }

  // Very new account with lots of tweets (bot behavior)
  if (profile.createdAt) {
    const ageMs = Date.now() - new Date(profile.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 90 && profile.tweetCount > 500) signals += 1;
  }

  return Math.min(signals / 4, 1.0); // normalize to 0-1
}

main().catch(err => {
  console.error('Crawler failed:', err);
  process.exit(1);
});
