// Twitter handle validation
export const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;
export const TWITTER_HANDLE_MAX_LENGTH = 15;

// Pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

// Rate limits
export const API_RATE_LIMIT_PER_MINUTE = 60;
export const SUBMISSION_RATE_LIMIT_PER_DAY = 20;
export const SUBMISSION_MIN_REASON_LENGTH = 10;

// Submission anti-abuse
export const BRIGADING_THRESHOLD = 5;
export const ACCOUNT_AGE_GATE_HOURS = 24;
