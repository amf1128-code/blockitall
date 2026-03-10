import { supabase } from './supabase';
import type { List, BlockedAccount, BlockAction } from './types';

const DEFAULT_PAGE_SIZE = 50;

// ==================
// Lists
// ==================

export async function fetchLists(): Promise<List[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createList(list: { name: string; slug: string; description: string; is_public: boolean }): Promise<List> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('lists')
    .insert({ ...list, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateList(id: string, updates: Partial<Pick<List, 'name' | 'slug' | 'description' | 'is_public'>>): Promise<List> {
  const { data, error } = await supabase
    .from('lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('lists').delete().eq('id', id);
  if (error) throw error;
}

// ==================
// Blocked Accounts
// ==================

export async function fetchAccountsForList(
  listId: string,
  options: { cursor?: string; pageSize?: number; search?: string; status?: string } = {}
): Promise<{ data: (BlockedAccount & { list_membership_created_at: string })[]; cursor: string | null; has_more: boolean }> {
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;

  let query = supabase
    .from('list_memberships')
    .select(`
      created_at,
      account:blocked_accounts(*)
    `)
    .eq('list_id', listId)
    .order('created_at', { ascending: false })
    .limit(pageSize + 1);

  if (options.cursor) {
    query = query.lt('created_at', options.cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Flatten the join result
  let accounts = (data || []).map((row: any) => ({
    ...row.account,
    list_membership_created_at: row.created_at,
  }));

  // Apply client-side search filter (handle or display_name)
  if (options.search) {
    const searchLower = options.search.toLowerCase();
    accounts = accounts.filter(
      (a: any) =>
        a.twitter_handle.includes(searchLower) ||
        (a.display_name && a.display_name.toLowerCase().includes(searchLower))
    );
  }

  if (options.status) {
    accounts = accounts.filter((a: any) => a.status === options.status);
  }

  const has_more = accounts.length > pageSize;
  if (has_more) accounts = accounts.slice(0, pageSize);

  const cursor = accounts.length > 0
    ? accounts[accounts.length - 1].list_membership_created_at
    : null;

  return { data: accounts, cursor, has_more };
}

export async function addAccountToList(
  listId: string,
  handle: string,
  reason?: string
): Promise<BlockedAccount> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Upsert the blocked_account (handle might already exist on another list)
  const { data: account, error: accountError } = await supabase
    .from('blocked_accounts')
    .upsert(
      {
        twitter_handle: handle,
        reason: reason || null,
        added_by: user.id,
        source: 'manual' as const,
        status: 'active' as const,
      },
      { onConflict: 'twitter_handle' }
    )
    .select()
    .single();
  if (accountError) throw accountError;

  // Add to the list
  const { error: membershipError } = await supabase
    .from('list_memberships')
    .upsert(
      { list_id: listId, account_id: account.id },
      { onConflict: 'list_id,account_id' }
    );
  if (membershipError) throw membershipError;

  return account;
}

export async function bulkAddAccountsToList(
  listId: string,
  handles: string[],
  reason?: string
): Promise<{ added: number; skipped: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let added = 0;
  let skipped = 0;

  // Process in batches to avoid overwhelming the database
  const batchSize = 50;
  for (let i = 0; i < handles.length; i += batchSize) {
    const batch = handles.slice(i, i + batchSize);

    // Upsert accounts
    const { data: accounts, error: accountError } = await supabase
      .from('blocked_accounts')
      .upsert(
        batch.map((handle) => ({
          twitter_handle: handle,
          reason: reason || null,
          added_by: user.id,
          source: 'manual' as const,
          status: 'active' as const,
        })),
        { onConflict: 'twitter_handle', ignoreDuplicates: false }
      )
      .select('id');
    if (accountError) throw accountError;

    if (!accounts) continue;

    // Add memberships
    const { error: membershipError } = await supabase
      .from('list_memberships')
      .upsert(
        accounts.map((a) => ({ list_id: listId, account_id: a.id })),
        { onConflict: 'list_id,account_id' }
      );
    if (membershipError) throw membershipError;

    added += accounts.length;
  }

  skipped = handles.length - added;
  return { added, skipped };
}

export async function removeAccountFromList(listId: string, accountId: string): Promise<void> {
  const { error } = await supabase
    .from('list_memberships')
    .delete()
    .eq('list_id', listId)
    .eq('account_id', accountId);
  if (error) throw error;
}

// ==================
// Stats
// ==================

export async function fetchStats(): Promise<{
  totalAccounts: number;
  subscribersByList: { list_id: string; list_name: string; count: number }[];
  recentBlockActions: BlockAction[];
}> {
  const [accountsRes, listsRes, subsRes, actionsRes] = await Promise.all([
    supabase.from('blocked_accounts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('lists').select('id, name'),
    supabase.from('user_subscriptions').select('list_id'),
    supabase
      .from('block_actions')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(20),
  ]);

  const totalAccounts = accountsRes.count || 0;

  // Count subscribers per list
  const subCounts = new Map<string, number>();
  for (const sub of subsRes.data || []) {
    subCounts.set(sub.list_id, (subCounts.get(sub.list_id) || 0) + 1);
  }

  const subscribersByList = (listsRes.data || []).map((l) => ({
    list_id: l.id,
    list_name: l.name,
    count: subCounts.get(l.id) || 0,
  }));

  return {
    totalAccounts,
    subscribersByList,
    recentBlockActions: actionsRes.data || [],
  };
}
