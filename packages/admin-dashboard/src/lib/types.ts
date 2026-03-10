// Re-export types from shared package
// In a real monorepo with workspaces, we'd import from @blockitall/shared.
// For simplicity, we duplicate the types here.

export type AccountSource = 'manual' | 'crawler' | 'community_submission';
export type AccountStatus = 'active' | 'removed' | 'under_review';
export type BlockActionType = 'blocked' | 'failed' | 'skipped';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface List {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  account_count: number;
  created_at: string;
  updated_at: string;
}

export interface BlockedAccount {
  id: string;
  twitter_handle: string;
  twitter_id: string | null;
  display_name: string | null;
  reason: string | null;
  added_by: string;
  source: AccountSource;
  status: AccountStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BlockAction {
  id: string;
  user_id: string;
  twitter_handle: string;
  action: BlockActionType;
  error_message: string | null;
  executed_at: string;
}

export interface Submission {
  id: string;
  submitted_by: string;
  twitter_handle: string;
  target_list_id: string;
  reason: string;
  evidence_url: string | null;
  status: SubmissionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
