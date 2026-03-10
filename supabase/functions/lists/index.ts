// Supabase Edge Function: Public API for block lists
// These endpoints do NOT require authentication — the block list data is public.
//
// Routes:
//   GET /lists              — All public lists
//   GET /lists/:slug        — Count for a specific list
//   GET /lists/:slug/accounts — Paginated accounts for a list (supports ?since= for incremental sync)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple in-memory rate limiting (per-function instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts: ["lists"] or ["lists", slug] or ["lists", slug, "accounts"]

  try {
    // GET /lists
    if (pathParts.length === 1 && pathParts[0] === 'lists') {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name, slug, description, account_count')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      });
    }

    // GET /lists/:slug (count)
    if (pathParts.length === 2 && pathParts[0] === 'lists') {
      const slug = pathParts[1];
      const { data, error } = await supabase
        .from('lists')
        .select('id, name, slug, account_count')
        .eq('slug', slug)
        .eq('is_public', true)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'List not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      });
    }

    // GET /lists/:slug/accounts
    if (pathParts.length === 3 && pathParts[0] === 'lists' && pathParts[2] === 'accounts') {
      const slug = pathParts[1];
      const since = url.searchParams.get('since');
      const cursor = url.searchParams.get('cursor');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 200);

      // Look up list
      const { data: list, error: listError } = await supabase
        .from('lists')
        .select('id')
        .eq('slug', slug)
        .eq('is_public', true)
        .single();

      if (listError || !list) {
        return new Response(JSON.stringify({ error: 'List not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let query = supabase
        .from('list_memberships')
        .select(`
          created_at,
          account:blocked_accounts!inner(twitter_handle, twitter_id, status)
        `)
        .eq('list_id', list.id)
        .eq('blocked_accounts.status', 'active')
        .order('created_at', { ascending: true })
        .limit(limit + 1);

      if (since) {
        query = query.gt('created_at', since);
      }
      if (cursor) {
        query = query.gt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      const hasMore = (data?.length || 0) > limit;
      const results = (data || []).slice(0, limit);

      const accounts = results.map((row: any) => ({
        handle: row.account.twitter_handle,
        twitter_id: row.account.twitter_id,
        added_at: row.created_at,
      }));

      const nextCursor = results.length > 0
        ? results[results.length - 1].created_at
        : null;

      return new Response(JSON.stringify({
        data: accounts,
        cursor: nextCursor,
        has_more: hasMore,
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'Content-Encoding': 'identity', // Supabase handles gzip at the edge
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
