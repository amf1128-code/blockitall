// Bot detection heuristics — focused on OnlyFans/porn spam accounts.
// Each detector returns a score from 0.0 (clean) to 1.0 (porn bot)
// along with a reason string. The final score is a weighted average.

// Explicit and adult content keywords — covers English, Hindi, and common spam variants.
// Organized by confidence level.
const HIGH_CONFIDENCE_KEYWORDS = [
  'onlyfans', 'fansly', 'manyvids', 'chaturbate', 'cam4',
  'free nudes', 'nudes in bio', 'nudes in dm', 'send nudes',
  'link in bio 18', 'cum tribute', 'dick rate', 'sext',
  'chudai', 'chut', 'lund', 'bhabhi sex', 'desi sex',
  'boobs show', 'pussy pic', 'nude video call',
  'sex tape', 'leaked nudes', 'premium snap',
  'subscribe to my', 'check my bio', 'click my link',
  'meet me here', 'i am available',
];

const MEDIUM_CONFIDENCE_KEYWORDS = [
  'dm for collab', 'link in bio', 'bio link',
  'hot content', 'exclusive content', 'spicy content', 'adult content',
  'facetime', 'videocall', 'hookup', 'hmu',
  'sugar daddy', 'sugar baby', 'findom',
  'joi', 'gfe', 'b/g', 'g/g', 'solo play',
  'lingerie', 'boudoir',
  'thirst trap', 'come play',
  'uncensored', 'uncut version',
  'horny', 'randy', 'chod', 'maal', 'randi',
];

// Link domains commonly used by porn/OF spam
const SPAM_LINK_DOMAINS = [
  'onlyfans.com', 'fansly.com', 'manyvids.com', 'linktr.ee',
  'beacons.ai', 'allmylinks.com', 'linktree.com', 'campsite.bio',
  'hoo.be', 'snipfeed.co', 'direct.me', 'withkoji.com',
  'fans.ly', 'fancentro.com',
];

/**
 * Scan bio/description for adult content signals.
 */
export function bioKeywords(user) {
  const bio = (user.description || '').toLowerCase();
  if (!bio) return { score: 0, reason: null };

  const reasons = [];
  let score = 0;

  // Check high-confidence keywords
  const highMatches = HIGH_CONFIDENCE_KEYWORDS.filter(kw => bio.includes(kw));
  if (highMatches.length >= 2) {
    score = Math.max(score, 0.95);
    reasons.push(`Bio contains: ${highMatches.slice(0, 3).join(', ')}`);
  } else if (highMatches.length === 1) {
    score = Math.max(score, 0.7);
    reasons.push(`Bio contains: ${highMatches[0]}`);
  }

  // Check medium-confidence keywords
  const medMatches = MEDIUM_CONFIDENCE_KEYWORDS.filter(kw => bio.includes(kw));
  if (medMatches.length >= 2) {
    score = Math.max(score, 0.6);
    reasons.push(`Bio signals: ${medMatches.slice(0, 3).join(', ')}`);
  }

  // Check for age disclaimers (strong signal when combined with other signals)
  if (/18\+|nsfw|🔞|🔥.*link|adults only/i.test(bio)) {
    score = Math.max(score, 0.4);
    reasons.push('Age disclaimer in bio');
  }

  return { score, reason: reasons.length > 0 ? reasons.join('; ') : null };
}

/**
 * Check if the bio or pinned tweet links to known adult platforms.
 */
export function linkAnalysis(user, tweets) {
  const bio = (user.description || '').toLowerCase();
  const allText = [bio];

  // Include tweet URLs
  for (const tweet of (tweets || [])) {
    for (const url of (tweet.entities?.urls || [])) {
      allText.push((url.expanded_url || url.url || '').toLowerCase());
      allText.push((url.display_url || '').toLowerCase());
    }
  }

  const combined = allText.join(' ');
  const matchedDomains = SPAM_LINK_DOMAINS.filter(d => combined.includes(d));

  if (matchedDomains.length >= 2) {
    return { score: 0.9, reason: `Links to: ${matchedDomains.join(', ')}` };
  }
  if (matchedDomains.length === 1) {
    return { score: 0.7, reason: `Links to: ${matchedDomains[0]}` };
  }

  return { score: 0, reason: null };
}

/**
 * Analyze tweet content for porn spam patterns.
 */
export function tweetPatterns(tweets) {
  if (!tweets || tweets.length === 0) return { score: 0, reason: null };

  let adultSignals = 0;
  let duplicateTexts = new Map();
  let linkSpam = 0;

  for (const tweet of tweets) {
    const text = (tweet.text || '').toLowerCase();

    // Check for adult keywords in tweets
    const hasHigh = HIGH_CONFIDENCE_KEYWORDS.some(kw => text.includes(kw));
    const hasMed = MEDIUM_CONFIDENCE_KEYWORDS.some(kw => text.includes(kw));
    if (hasHigh) adultSignals += 2;
    else if (hasMed) adultSignals += 1;

    // Track duplicate content (common bot pattern — same promo tweet over and over)
    const normalized = text
      .replace(/https?:\/\/\S+/g, '')  // strip links
      .replace(/@\w+/g, '')            // strip mentions
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length > 15) {
      duplicateTexts.set(normalized, (duplicateTexts.get(normalized) || 0) + 1);
    }

    // Link-heavy tweets (2+ links = promo spam)
    const urlCount = (tweet.entities?.urls || []).length;
    if (urlCount >= 2) linkSpam++;
  }

  const reasons = [];
  let score = 0;

  // Adult content ratio
  const adultRatio = adultSignals / (tweets.length * 2); // normalized since high = 2 pts
  if (adultRatio > 0.4) {
    score = Math.max(score, 0.85);
    reasons.push(`${Math.round(adultRatio * 100)}% adult content in tweets`);
  } else if (adultRatio > 0.15) {
    score = Math.max(score, 0.5);
    reasons.push(`${Math.round(adultRatio * 100)}% adult content in tweets`);
  }

  // Duplicate content — a strong bot signal
  const maxDupes = Math.max(...duplicateTexts.values(), 0);
  if (maxDupes >= 5) {
    score = Math.max(score, 0.85);
    reasons.push(`${maxDupes}x duplicate tweets`);
  } else if (maxDupes >= 3) {
    score = Math.max(score, 0.6);
    reasons.push(`${maxDupes}x duplicate tweets`);
  }

  // Link spam ratio
  const linkRatio = linkSpam / tweets.length;
  if (linkRatio > 0.6) {
    score = Math.max(score, 0.5);
    reasons.push(`${Math.round(linkRatio * 100)}% link-heavy tweets`);
  }

  return { score, reason: reasons.length > 0 ? reasons.join('; ') : null };
}

/**
 * Detect accounts that reply-spam under popular tweets to drive traffic.
 * These accounts reply to viral tweets with "check my bio" / link bait.
 */
export function replySpam(tweets) {
  if (!tweets || tweets.length === 0) return { score: 0, reason: null };

  let replyCount = 0;
  let promoReplies = 0;

  const promoPhrases = [
    'check my', 'look at my', 'click my', 'tap my', 'see my',
    'link in', 'bio for', 'dm me', 'text me', 'hmu',
    'i am available', 'come see', 'come play',
  ];

  for (const tweet of tweets) {
    if (tweet.referenced_tweets?.some(r => r.type === 'replied_to') ||
        tweet.in_reply_to_user_id) {
      replyCount++;
      const text = (tweet.text || '').toLowerCase();
      if (promoPhrases.some(p => text.includes(p))) {
        promoReplies++;
      }
    }
  }

  if (replyCount === 0) return { score: 0, reason: null };

  const promoRatio = promoReplies / replyCount;
  if (promoRatio > 0.5 && promoReplies >= 3) {
    return { score: 0.8, reason: `${promoReplies}/${replyCount} replies are promo spam` };
  }
  if (promoRatio > 0.3 && promoReplies >= 2) {
    return { score: 0.5, reason: `${promoReplies}/${replyCount} replies are promo spam` };
  }

  return { score: 0, reason: null };
}

/**
 * Combine all detector scores into a final weighted score.
 * Bio and tweet patterns are weighted heaviest since they're the strongest signals.
 */
export function computeScore(detectorResults) {
  const weights = {
    bioKeywords: 0.35,
    linkAnalysis: 0.20,
    tweetPatterns: 0.30,
    replySpam: 0.15,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  const reasons = [];

  for (const [name, result] of Object.entries(detectorResults)) {
    const weight = weights[name] || 0.15;
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
