-- Migration 002: Create core tables

-- Admin role tracking (maps Supabase auth users to app roles)
CREATE TABLE user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Block lists
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  account_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Twitter accounts on block lists
CREATE TABLE blocked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_handle TEXT NOT NULL UNIQUE,
  twitter_id TEXT,
  display_name TEXT,
  reason TEXT,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  source account_source NOT NULL DEFAULT 'manual',
  status account_status NOT NULL DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: accounts <-> lists
CREATE TABLE list_memberships (
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES blocked_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, account_id)
);

-- User subscriptions to lists
CREATE TABLE user_subscriptions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);

-- Block action log
CREATE TABLE block_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  twitter_handle TEXT NOT NULL,
  action block_action_type NOT NULL,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Community submissions (Phase 4, but create table now for completeness)
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  twitter_handle TEXT NOT NULL,
  target_list_id UUID NOT NULL REFERENCES lists(id),
  reason TEXT NOT NULL CHECK (char_length(reason) >= 10),
  evidence_url TEXT,
  status submission_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
