// Bot detection heuristics — focused on OnlyFans/porn spam accounts.
// Each detector returns a score from 0.0 (clean) to 1.0 (porn bot)
// along with a reason string. The final score is a weighted average.

// Explicit and adult content keywords — covers English, Hindi, and common spam variants.
// Organized by confidence level.
const HIGH_CONFIDENCE_KEYWORDS = [
  // Platform names
  'onlyfans', 'fansly', 'manyvids', 'chaturbate', 'cam4',
  'stripchat', 'livejasmin', 'bongacams', 'myfreecams', 'xvideos',
  'pornhub', 'xhamster', 'brazzers', 'bangbros',

  // Explicit solicitation
  'free nudes', 'nudes in bio', 'nudes in dm', 'send nudes',
  'link in bio 18', 'cum tribute', 'dick rate', 'sext me',
  'boobs show', 'pussy pic', 'nude video call',
  'sex tape', 'leaked nudes', 'premium snap',
  'subscribe to my', 'check my bio', 'click my link',
  'meet me here', 'i am available',
  'dm to buy', 'dm for prices', 'dm for the link',
  'full video in bio', 'full vid in bio', 'longer version in bio',

  // Hindi/Desi spam (high confidence)
  'chudai', 'chut', 'lund', 'bhabhi sex', 'desi sex',
  'wataa', 'gaand', 'chod de', 'nangi', 'bhosdike',

  // Age gate / MDNI (strong spam signal when combined with other content)
  'mdni', 'minors dni', 'no minors',

  // Kink/fetish spam keywords (high confidence when used promotionally)
  'findom', 'paypig', 'cash slave', 'money slave',
  'sissy training', 'cuck', 'cuckolding',
  'femdom', 'domme', 'goddess worship',
  'bbc worship', 'qos', 'queen of spades',
  'hotwife', 'hot wife', 'bull wanted',
  'cbt', 'sph', 'cei', 'jerk off instruction',
  'drain your wallet', 'tribute me', 'send tribute',

  // Explicit body/act terms used in spam
  'blowjob', 'deepthroat', 'anal', 'creampie',
  'gangbang', 'threesome', 'squirt', 'facial',
  'titjob', 'handjob', 'footjob',
  'milf next door', 'barely legal',
];

const MEDIUM_CONFIDENCE_KEYWORDS = [
  // Link/bio bait
  'dm for collab', 'link in bio', 'bio link',
  'hot content', 'exclusive content', 'spicy content', 'adult content',
  'premium content', 'vip content', 'private content',
  'facetime', 'videocall', 'hookup', 'hmu',

  // Financial domination / sugar
  'sugar daddy', 'sugar baby', 'sugar mommy',
  'cashapp me', 'venmo me', 'send me money',

  // Adult content creation terms
  'joi', 'gfe', 'b/g', 'g/g', 'solo play',
  'lingerie', 'boudoir',
  'cosplay lewds', 'lewds', 'ahegao',
  'bath content', 'shower content',

  // Kink terms (medium confidence — could be discussion, not promo)
  'bbc', 'bdsm', 'bondage', 'kink friendly',
  'dom', 'sub', 'switch', 'rope bunny',
  'foot fetish', 'feet pics', 'foot worship',
  'latex', 'leather', 'pvc',
  'pet play', 'puppy play', 'kitten play',
  'breeding kink', 'breeding',
  'cnc', 'consensual non-consent',
  'edge', 'edging', 'denial',

  // Engagement bait
  'thirst trap', 'come play', 'come find out',
  'uncensored', 'uncut version', 'full version',
  'like for a surprise', 'rt for a surprise',
  'drop a 🍑', 'drop an emoji',
  'who wants to see', 'want to see more',

  // Hindi/Desi (medium confidence)
  'horny', 'randy', 'chod', 'maal', 'randi',
  'bhabhi', 'aunty hot', 'desi hot',
  'sexy reels', 'hot reels',

  // Escort/meetup signals
  'incall', 'outcall', 'available now',
  'car fun', 'hotel fun', 'looking for fun',
  'no rush', 'girlfriend experience',
];

// Emojis frequently used by spam/bot accounts — scored as signals
const SPAM_EMOJIS = [
  '🔞',   // no-under-18
  '♠️',   // spade (QoS symbol)
  '🍑',   // peach (butt)
  '🍆',   // eggplant (phallic)
  '💦',   // sweat drops (sexual)
  '🔥',   // fire (hot)
  '👅',   // tongue
  '🍒',   // cherries (breasts)
  '🦶',   // foot
  '💋',   // kiss
  '🤑',   // money face (findom)
  '💰',   // money bag (findom)
  '💸',   // money with wings
  '👑',   // crown (domme)
  '⛓️',   // chains (bdsm)
  '🖤',   // black heart
];

// Link domains commonly used by porn/OF spam
const SPAM_LINK_DOMAINS = [
  // Adult platforms
  'onlyfans.com', 'fansly.com', 'manyvids.com', 'fans.ly', 'fancentro.com',
  'loyalfans.com', 'justfor.fans', 'frisk.chat', 'unfiltrd.com',
  'pornhub.com', 'xvideos.com', 'xhamster.com',
  'chaturbate.com', 'stripchat.com', 'bongacams.com', 'cam4.com',
  'myfreecams.com', 'livejasmin.com',
  'clips4sale.com', 'iwantclips.com', 'extralunchmoney.com',

  // Link aggregators (commonly used to hide adult links)
  'linktr.ee', 'beacons.ai', 'allmylinks.com', 'linktree.com',
  'campsite.bio', 'hoo.be', 'snipfeed.co', 'direct.me',
  'withkoji.com', 'solo.to', 'carrd.co', 'taplink.cc',
  'flow.page', 'msha.ke', 'lnk.bio',

  // Payment links (used for findom/selling)
  'cash.app', 'throne.com', 'wishtender.com',
];

/**
 * Count how many spam-associated emojis appear in a text.
 */
function countSpamEmojis(text) {
  let count = 0;
  const matched = [];
  for (const emoji of SPAM_EMOJIS) {
    const occurrences = text.split(emoji).length - 1;
    if (occurrences > 0) {
      count += occurrences;
      matched.push(emoji);
    }
  }
  return { count, matched };
}

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

  // Check for spam emoji clusters in bio (3+ = strong signal, 2 = moderate)
  const { count: emojiCount, matched: emojiList } = countSpamEmojis(user.description || '');
  if (emojiCount >= 3) {
    score = Math.max(score, 0.6);
    reasons.push(`Bio has ${emojiCount} spam emojis: ${emojiList.join('')}`);
  } else if (emojiCount >= 2) {
    score = Math.max(score, 0.35);
    reasons.push(`Bio has spam emojis: ${emojiList.join('')}`);
  }

  return { score, reason: reasons.length > 0 ? reasons.join('; ') : null };
}

/**
 * Analyze the display name for spam signals.
 * Spam accounts often pack display names with suggestive emojis and keywords.
 * E.g. "🍑 Jessica 💦 Link in Bio 🔞" or "QueenOfSpades ♠️👑"
 */
export function displayNameSignals(user) {
  const name = (user.name || '');
  const nameLower = name.toLowerCase();
  if (!nameLower) return { score: 0, reason: null };

  const reasons = [];
  let score = 0;

  // Check for spam keywords in display name
  const nameKeywords = [
    'onlyfans', 'fansly', 'link in bio', 'check bio', 'dm me',
    'free trial', 'subscribe', 'mdni', '18+', 'nsfw',
    'findom', 'paypig', 'domme', 'goddess',
    'hotwife', 'queen of spades', 'qos',
    'available now', 'selling',
  ];

  const nameMatches = nameKeywords.filter(kw => nameLower.includes(kw));
  if (nameMatches.length >= 2) {
    score = Math.max(score, 0.85);
    reasons.push(`Display name contains: ${nameMatches.join(', ')}`);
  } else if (nameMatches.length === 1) {
    score = Math.max(score, 0.5);
    reasons.push(`Display name contains: ${nameMatches[0]}`);
  }

  // Heavy emoji usage in display name (spam accounts love emoji-stuffed names)
  const { count: emojiCount, matched: emojiList } = countSpamEmojis(name);
  if (emojiCount >= 3) {
    score = Math.max(score, 0.55);
    reasons.push(`Display name emoji spam: ${emojiList.join('')}`);
  } else if (emojiCount >= 2) {
    score = Math.max(score, 0.3);
    reasons.push(`Display name emojis: ${emojiList.join('')}`);
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

  // Spam emoji saturation across tweets
  let totalSpamEmojis = 0;
  for (const tweet of tweets) {
    const { count } = countSpamEmojis(tweet.text || '');
    totalSpamEmojis += count;
  }
  const emojiPerTweet = totalSpamEmojis / tweets.length;
  if (emojiPerTweet >= 2) {
    score = Math.max(score, 0.5);
    reasons.push(`Avg ${emojiPerTweet.toFixed(1)} spam emojis/tweet`);
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
    bioKeywords: 0.30,
    displayNameSignals: 0.10,
    linkAnalysis: 0.15,
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
