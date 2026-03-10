-- Migration 003: Create indexes for performance

-- Primary lookup index for blocked accounts by handle
CREATE INDEX idx_blocked_accounts_handle ON blocked_accounts(twitter_handle);

-- Composite index for list membership lookups
CREATE INDEX idx_list_memberships_list_account ON list_memberships(list_id, account_id);

-- Index for fetching accounts added since a timestamp (incremental sync)
CREATE INDEX idx_list_memberships_created_at ON list_memberships(list_id, created_at);

-- Index for blocked accounts by status (admin filtering)
CREATE INDEX idx_blocked_accounts_status ON blocked_accounts(status);

-- Index for block actions by user (analytics)
CREATE INDEX idx_block_actions_user ON block_actions(user_id, executed_at);

-- Index for submissions by status (admin review queue)
CREATE INDEX idx_submissions_status ON submissions(status, created_at);

-- Index for lists by slug (public API lookups)
CREATE INDEX idx_lists_slug ON lists(slug);
