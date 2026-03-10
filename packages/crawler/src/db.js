// Supabase database operations for the crawler.

import { createClient } from '@supabase/supabase-js';

export class Database {
  constructor(supabaseUrl, supabaseKey) {
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get or create the target block list.
   */
  async getOrCreateList(slug, name, description) {
    // Try to find existing list
    const { data: existing } = await this.client
      .from('lists')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) return existing.id;

    // Create new list
    const { data, error } = await this.client
      .from('lists')
      .insert({ slug, name, description, is_public: true })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create list: ${error.message}`);
    return data.id;
  }

  /**
   * Check which handles are already in the database.
   * Returns a Set of lowercase handles.
   */
  async getExistingHandles(handles) {
    if (handles.length === 0) return new Set();

    const { data, error } = await this.client
      .from('blocked_accounts')
      .select('twitter_handle')
      .in('twitter_handle', handles);

    if (error) throw new Error(`Failed to check handles: ${error.message}`);
    return new Set((data || []).map(r => r.twitter_handle.toLowerCase()));
  }

  /**
   * Get known spam handles that can be used as seeds for graph crawling.
   * Returns active blocked accounts, most recent first.
   */
  async getSeedHandles(limit = 50) {
    const { data, error } = await this.client
      .from('blocked_accounts')
      .select('twitter_handle, twitter_id')
      .eq('status', 'active')
      .eq('source', 'crawler')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn(`Failed to fetch seed handles: ${error.message}`);
      return [];
    }
    return (data || []).map(r => ({
      handle: r.twitter_handle.toLowerCase(),
      id: r.twitter_id,
    }));
  }

  /**
   * Add a detected account to the block list.
   */
  async addDetectedAccount({ handle, twitterId, displayName, score, reasons, status, detectorResults }, listId) {
    // Upsert into blocked_accounts
    const { data: account, error: accountErr } = await this.client
      .from('blocked_accounts')
      .upsert({
        twitter_handle: handle,
        twitter_id: twitterId || null,
        display_name: displayName || null,
        reason: reasons.join('; '),
        source: 'crawler',
        status,
        metadata: {
          score,
          detectorResults,
          crawled_at: new Date().toISOString(),
        },
      }, { onConflict: 'twitter_handle' })
      .select('id')
      .single();

    if (accountErr) throw new Error(`Failed to add account: ${accountErr.message}`);

    // Link to list
    if (listId && account) {
      await this.client
        .from('list_memberships')
        .upsert({
          list_id: listId,
          account_id: account.id,
        }, { onConflict: 'list_id,account_id' });
    }

    return account.id;
  }
}
