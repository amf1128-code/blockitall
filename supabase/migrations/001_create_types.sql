-- Migration 001: Create custom enum types
-- These enums are used across multiple tables

CREATE TYPE account_source AS ENUM ('manual', 'crawler', 'community_submission');
CREATE TYPE account_status AS ENUM ('active', 'removed', 'under_review');
CREATE TYPE block_action_type AS ENUM ('blocked', 'failed', 'skipped');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');
