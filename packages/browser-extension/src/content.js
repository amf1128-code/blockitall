// Content script — runs on twitter.com / x.com
// Handles blocking users via Twitter's internal API using the user's existing session.

const extensionApi = globalThis.browser || globalThis.chrome;

// Extract CSRF token from cookies
function getCsrfToken() {
  const match = document.cookie.match(/ct0=([^;]+)/);
  return match ? match[1] : null;
}

// Extract auth token from cookies
function getAuthToken() {
  const match = document.cookie.match(/auth_token=([^;]+)/);
  return match ? match[1] : null;
}

// Twitter's public bearer token (embedded in their web app, not secret)
const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * Block a user via Twitter's internal GraphQL API.
 * Uses the user's existing session cookies — no API keys needed.
 */
async function blockUser(handle) {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    return { success: false, error: 'Not logged in to Twitter (no CSRF token)' };
  }

  try {
    // First, look up the user ID from their handle
    const userId = await getUserId(handle, csrfToken);
    if (!userId) {
      return { success: false, error: `Could not find user @${handle}` };
    }

    // Then block using the user ID
    const response = await fetch('https://x.com/i/api/1.1/blocks/create.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Csrf-Token': csrfToken,
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'X-Twitter-Active-User': 'yes',
        'X-Twitter-Auth-Type': 'OAuth2Session',
      },
      credentials: 'include',
      body: `user_id=${userId}`,
    });

    if (response.ok) {
      return { success: true };
    }

    const errorText = await response.text();
    if (response.status === 403) {
      return { success: false, error: 'Session expired or rate limited' };
    }
    return { success: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Look up a Twitter user ID from their handle using the internal API.
 */
async function getUserId(handle, csrfToken) {
  const variables = JSON.stringify({
    screen_name: handle,
    withSafetyModeUserFields: true,
  });
  const features = JSON.stringify({
    hidden_profile_subscriptions_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    subscriptions_feature_can_gift_premium: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
  });

  const params = new URLSearchParams({ variables, features });
  const url = `https://x.com/i/api/graphql/xc8f1g7BYqr6VTzTbvNlGw/UserByScreenName?${params}`;

  const response = await fetch(url, {
    headers: {
      'X-Csrf-Token': csrfToken,
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'X-Twitter-Active-User': 'yes',
      'X-Twitter-Auth-Type': 'OAuth2Session',
    },
    credentials: 'include',
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data?.data?.user?.result?.rest_id || null;
}

// Listen for block commands from the background script
extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLOCK_USER') {
    blockUser(message.handle).then(sendResponse);
    return true; // async
  }

  if (message.type === 'GET_SESSION_INFO') {
    const csrfToken = getCsrfToken();
    const authToken = getAuthToken();
    sendResponse({
      loggedIn: !!(csrfToken && authToken),
      hasCsrf: !!csrfToken,
      hasAuth: !!authToken,
    });
    return false;
  }
});
