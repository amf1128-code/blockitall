-- Migration 005: Row Level Security policies

-- Enable RLS on all tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==================
-- user_roles
-- ==================
CREATE POLICY "Admins can manage roles"
  ON user_roles FOR ALL
  USING (is_admin());

CREATE POLICY "Users can read their own role"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- ==================
-- lists
-- ==================
CREATE POLICY "Anyone can read public lists"
  ON lists FOR SELECT
  USING (is_public = true);

CREATE POLICY "Admins can manage all lists"
  ON lists FOR ALL
  USING (is_admin());

-- ==================
-- blocked_accounts
-- ==================
CREATE POLICY "Anyone can read active blocked accounts"
  ON blocked_accounts FOR SELECT
  USING (status = 'active');

CREATE POLICY "Admins can read all blocked accounts"
  ON blocked_accounts FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can manage blocked accounts"
  ON blocked_accounts FOR INSERT
  USING (is_admin());

CREATE POLICY "Admins can update blocked accounts"
  ON blocked_accounts FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins can delete blocked accounts"
  ON blocked_accounts FOR DELETE
  USING (is_admin());

-- ==================
-- list_memberships
-- ==================
CREATE POLICY "Anyone can read list memberships"
  ON list_memberships FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage list memberships"
  ON list_memberships FOR ALL
  USING (is_admin());

-- ==================
-- user_subscriptions
-- ==================
CREATE POLICY "Users can manage their own subscriptions"
  ON user_subscriptions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (is_admin());

-- ==================
-- block_actions
-- ==================
CREATE POLICY "Users can insert their own block actions"
  ON block_actions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read their own block actions"
  ON block_actions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all block actions"
  ON block_actions FOR SELECT
  USING (is_admin());

-- ==================
-- submissions
-- ==================
CREATE POLICY "Users can insert their own submissions"
  ON submissions FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Users can read their own submissions"
  ON submissions FOR SELECT
  USING (submitted_by = auth.uid());

CREATE POLICY "Admins can manage all submissions"
  ON submissions FOR ALL
  USING (is_admin());
