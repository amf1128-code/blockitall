// Database layer — writes detected bots to Supabase

import { createClient } from '@supabase/supabase-js';

export class Database {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get or create the target list for crawler results.
   */
  async getOrCreateList(slug, name, description) {
    const { data: existing } = await this.supabase
      .from('lists')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) return existing.id;

    const { data: created, error } = await this.supabase
      .from('lists')
      .insert({
        slug,
        name: name || slug,
        description: description || 'Auto-detected bot accounts',
        is_public: true,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create list: ${error.message}`);
    return created.id;
  }

  /**
   * Check which handles already exist in the database.
   * Returns a Set of handles that are already tracked.
   */
  async getExistingHandles(handles) {
    const existing = new Set();
    // Query in batches of 100
    for (let i = 0; i < handles.length; i += 100) {
      const batch = handles.slice(i, i + 100);
      const { data } = await this.supabase
        .from('blocked_accounts')
        .select('twitter_handle')
        .in('twitter_handle', batch);

      if (data) {
        for (const row of data) {
          existing.add(row.twitter_handle);
        }
      }
    }
    return existing;
  }

  /**
   * Insert a detected bot account and link it to the target list.
   */
  async addDetectedAccount(account, listId) {
    // Upsert the account
    const { data: inserted, error: accountError } = await this.supabase
      .from('blocked_accounts')
      .upsert({
        twitter_handle: account.handle,
        twitter_id: account.twitterId || null,
        display_name: account.displayName || null,
        reason: account.reasons.join('; '),
        source: 'crawler',
        status: account.status,
        metadata: {
          score: account.score,
          detectors: account.detectorResults,
          crawled_at: new Date().toISOString(),
        },
      }, {
        onConflict: 'twitter_handle',
      })
      .select('id')
      .single();

    if (accountError) {
      throw new Error(`Failed to insert account @${account.handle}: ${accountError.message}`);
    }

    // Link to list (ignore conflict if already linked)
    const { error: membershipError } = await this.supabase
      .from('list_memberships')
      .upsert({
        list_id: listId,
        account_id: inserted.id,
      }, {
        onConflict: 'list_id,account_id',
      });

    if (membershipError) {
      console.warn(`Warning: Failed to link @${account.handle} to list: ${membershipError.message}`);
    }

    return inserted.id;
  }
}
