// Bot detection heuristics — each detector returns a score from 0.0 (human) to 1.0 (bot)
// along with a reason string. The final score is a weighted average.

/**
 * Detect suspicious follower/following ratio.
 * Bots often follow many accounts but have very few followers.
 */
export function followerRatio(user) {
  const metrics = user.public_metrics;
  if (!metrics) return { score: 0, reason: null };

  const followers = metrics.followers_count || 0;
  const following = metrics.following_count || 0;

  if (following === 0) return { score: 0, reason: null };

  const ratio = followers / following;

  // Following thousands but almost no followers
  if (following > 500 && ratio < 0.01) {
    return { score: 0.8, reason: `Suspicious ratio: ${followers} followers / ${following} following` };
  }

  if (following > 200 && ratio < 0.05) {
    return { score: 0.5, reason: `Low follower ratio: ${followers}/${following}` };
  }

  return { score: 0, reason: null };
}

/**
 * Detect new accounts with high activity — a common bot pattern.
 */
export function accountAge(user) {
  if (!user.created_at) return { score: 0, reason: null };

  const ageMs = Date.now() - new Date(user.created_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const tweetCount = user.public_metrics?.tweet_count || 0;

  // Very new account with lots of tweets
  if (ageDays < 30 && tweetCount > 500) {
    return { score: 0.9, reason: `${tweetCount} tweets in ${Math.round(ageDays)} days` };
  }

  if (ageDays < 90 && tweetCount > 1000) {
    return { score: 0.7, reason: `${tweetCount} tweets in ${Math.round(ageDays)} days` };
  }

  // Very new with aggressive following
  if (ageDays < 7 && (user.public_metrics?.following_count || 0) > 200) {
    return { score: 0.7, reason: `${user.public_metrics.following_count} following in ${Math.round(ageDays)} days` };
  }

  return { score: 0, reason: null };
}

/**
 * Detect default/missing profile — bots often don't customize profiles.
 */
export function profileCompleteness(user) {
  let signals = 0;

  if (!user.description || user.description.trim().length < 5) signals++;
  if (!user.profile_image_url || user.profile_image_url.includes('default_profile')) signals++;

  if (signals >= 2) {
    return { score: 0.4, reason: 'Incomplete profile (no bio, default avatar)' };
  }

  return { score: 0, reason: null };
}

/**
 * Analyze tweet content for spam patterns.
 */
export function tweetPatterns(tweets) {
  if (!tweets || tweets.length === 0) return { score: 0, reason: null };

  let spamSignals = 0;
  let linkHeavy = 0;
  let duplicateTexts = new Map();

  for (const tweet of tweets) {
    const text = (tweet.text || '').toLowerCase();

    // Spam keywords
    const spamKeywords = [
      'onlyfans', 'link in bio', 'dm me', 'free nudes', 'subscribe',
      'click here', 'follow back', 'f4f', 'giveaway', 'airdrop',
      'crypto', 'nft drop', 'telegram', 'whatsapp',
    ];
    if (spamKeywords.some(kw => text.includes(kw))) {
      spamSignals++;
    }

    // Lots of links
    const urlCount = (tweet.entities?.urls || []).length;
    if (urlCount >= 2) linkHeavy++;

    // Duplicate content
    const normalized = text.replace(/https?:\/\/\S+/g, '').trim();
    if (normalized.length > 10) {
      duplicateTexts.set(normalized, (duplicateTexts.get(normalized) || 0) + 1);
    }
  }

  const reasons = [];
  let score = 0;

  // Spam keyword ratio
  const spamRatio = spamSignals / tweets.length;
  if (spamRatio > 0.5) {
    score = Math.max(score, 0.8);
    reasons.push(`${Math.round(spamRatio * 100)}% spam keywords`);
  } else if (spamRatio > 0.2) {
    score = Math.max(score, 0.5);
    reasons.push(`${Math.round(spamRatio * 100)}% spam keywords`);
  }

  // Link-heavy ratio
  const linkRatio = linkHeavy / tweets.length;
  if (linkRatio > 0.7) {
    score = Math.max(score, 0.6);
    reasons.push(`${Math.round(linkRatio * 100)}% link-heavy tweets`);
  }

  // Duplicate content
  const maxDupes = Math.max(...duplicateTexts.values(), 0);
  if (maxDupes > 3) {
    score = Math.max(score, 0.7);
    reasons.push(`${maxDupes} duplicate tweets`);
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}

/**
 * Combine all detector scores into a final weighted score.
 */
export function computeScore(detectorResults) {
  const weights = {
    followerRatio: 0.25,
    accountAge: 0.25,
    profileCompleteness: 0.15,
    tweetPatterns: 0.35,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  const reasons = [];

  for (const [name, result] of Object.entries(detectorResults)) {
    const weight = weights[name] || 0.2;
    weightedSum += result.score * weight;
    totalWeight += weight;
    if (result.reason) {
      reasons.push(result.reason);
    }
  }

  return {
    score: totalWeight > 0 ? weightedSum / totalWeight : 0,
    reasons,
  };
}
