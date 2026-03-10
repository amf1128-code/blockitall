// Crawler entry point — scans for bot accounts and adds them to BlockItAll

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

async function main() {
  const config = loadConfig();
  const twitter = new TwitterClient(config.twitterBearerToken);
  const db = new Database(config.supabaseUrl, config.supabaseKey);

  console.log(`BlockItAll Crawler`);
  console.log(`Target list: ${config.targetListSlug}`);
  console.log(`Thresholds: auto-approve=${config.autoApproveThreshold}, review=${config.reviewThreshold}`);
  console.log(`Scan limit: ${config.scanLimit}`);
  if (config.dryRun) console.log(`** DRY RUN — no database writes **`);
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

  // Search for porn/OnlyFans spam accounts
  const searchQueries = [
    // Original queries
    'onlyfans link in bio -is:retweet',
    'fansly subscribe -is:retweet',
    'free nudes dm -is:retweet',
    'chudai video -is:retweet',
    'desi bhabhi sex -is:retweet',
    'cum tribute dm -is:retweet',
    'check my bio 18+ -is:retweet',
    'nude video call -is:retweet',
    'premium snap add me -is:retweet',
    'leaked nudes link -is:retweet',

    // Link-in-bio variants
    'link in bio nsfw -is:retweet',
    'link in bio 🔞 -is:retweet',

    // MDNI / age-gating (strong spam signal)
    'mdni link -is:retweet',
    'minors dni onlyfans -is:retweet',

    // Findom / cash slave
    'findom paypig -is:retweet',
    'drain wallet tribute -is:retweet',

    // BBC / QoS / hotwife spam
    'queen of spades ♠️ -is:retweet',
    'bbc hotwife -is:retweet',

    // Hindi spam variants
    'wataa video -is:retweet',
    'desi randi -is:retweet',

    // Foot / fetish spam
    'feet pics dm -is:retweet',
    'foot worship dm -is:retweet',
  ];

  const candidateUsers = new Map(); // handle -> user object

  for (const query of searchQueries) {
    console.log(`Searching: "${query}"...`);
    try {
      const { tweets, users } = await twitter.searchRecentTweets(query, config.scanLimit);

      for (const user of users) {
        const handle = user.username.toLowerCase();
        if (!candidateUsers.has(handle)) {
          candidateUsers.set(handle, { ...user, matchedTweets: [] });
        }
      }

      // Link tweets to their authors
      for (const tweet of tweets) {
        const author = users.find(u => u.id === tweet.author_id);
        if (author) {
          const handle = author.username.toLowerCase();
          const candidate = candidateUsers.get(handle);
          if (candidate) {
            candidate.matchedTweets.push(tweet);
          }
        }
      }

      // Respect rate limits between searches
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Search failed for "${query}": ${err.message}`);
    }

    if (candidateUsers.size >= config.scanLimit) break;
  }

  console.log(`\nFound ${candidateUsers.size} candidate accounts to analyze`);

  // Filter out already-known accounts
  const handles = [...candidateUsers.keys()];
  let existingHandles = new Set();
  if (!config.dryRun) {
    existingHandles = await db.getExistingHandles(handles);
    console.log(`${existingHandles.size} already in database, skipping`);
  }

  // Analyze each candidate
  let added = 0;
  let reviewed = 0;
  let skipped = 0;

  for (const [handle, user] of candidateUsers) {
    if (existingHandles.has(handle)) {
      skipped++;
      continue;
    }

    // Fetch more tweets if we don't have enough from the search
    let tweets = user.matchedTweets || [];
    if (tweets.length < 5 && user.id) {
      try {
        tweets = await twitter.getUserTweets(user.id, 20);
        await new Promise(r => setTimeout(r, 1000));
      } catch {
        // Non-fatal — analyze with what we have
      }
    }

    // Run all detectors
    const detectorResults = {
      bioKeywords: bioKeywords(user),
      displayNameSignals: displayNameSignals(user),
      linkAnalysis: linkAnalysis(user, tweets),
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
            twitterId: user.id,
            displayName: user.name,
            score,
            reasons,
            status,
            detectorResults,
          }, listId);

          if (status === 'active') added++;
          else reviewed++;
        } catch (err) {
          console.error(`  Failed to add @${handle}: ${err.message}`);
        }
      } else {
        if (status === 'active') added++;
        else reviewed++;
      }
    } else {
      skipped++;
    }
  }

  console.log('\n--- Results ---');
  console.log(`Auto-blocked: ${added}`);
  console.log(`Sent to review: ${reviewed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Twitter API requests: ${twitter.requestCount}`);
}

main().catch(err => {
  console.error('Crawler failed:', err);
  process.exit(1);
});
