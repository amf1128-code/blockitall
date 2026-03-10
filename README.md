# BlockItAll

Community-powered block list for Twitter/X. Subscribe to curated lists of accounts (starting with porn bots) and block them in bulk via a browser extension.

## Project Structure

```
/packages
  /admin-dashboard    React admin app → Netlify
  /landing-page       Public landing page → Netlify
  /browser-extension  Chrome/Firefox MV3 extension
  /crawler            Automated bot detection
  /shared             Shared types and utilities
/supabase
  /migrations         SQL migration files (run in order)
  /functions          Supabase Edge Functions (public API)
  /seed               Development seed data
/docs                 Documentation and testing guides
```

## Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- npm

### 1. Set Up the Database

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Run each migration file in `/supabase/migrations/` in order (001 through 005)
4. Create an admin user: Go to Authentication > Users > Add User (email + password)
5. Copy the user's UUID, then run this SQL to grant admin role:
   ```sql
   INSERT INTO user_roles (user_id, role) VALUES ('YOUR_USER_UUID', 'admin');
   ```
6. Optionally run the seed data from `/supabase/seed/001_test_data.sql` (edit it first to set your admin user ID)

### 2. Set Up the Admin Dashboard

```bash
cd packages/admin-dashboard
cp .env.example .env
# Edit .env with your Supabase URL and anon key (find these in Supabase > Settings > API)
npm install
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

### 3. Deploy to Netlify

1. Connect your GitHub repo to Netlify
2. Set the build directory to `packages/admin-dashboard`
3. Set build command to `npm run build`
4. Set publish directory to `packages/admin-dashboard/dist`
5. Add environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### 4. Deploy the Public API (Edge Function)

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli)
2. Link your project: `supabase link --project-ref YOUR_PROJECT_REF`
3. Deploy: `supabase functions deploy lists`

The public API will be available at:
- `GET /lists` — All public lists
- `GET /lists/:slug` — List info and count
- `GET /lists/:slug/accounts?since=TIMESTAMP` — Paginated accounts (incremental sync)

## Architecture Decisions

- **No Twitter API keys.** The browser extension uses the user's existing Twitter session to make block requests directly from their browser. Session tokens never leave the user's machine.
- **Supabase for everything.** Postgres + Auth + RLS + Edge Functions in one platform, generous free tier.
- **Cursor-based pagination.** Uses `created_at` timestamps as cursors for consistent performance at scale.
- **Incremental sync.** The `since` parameter on the accounts endpoint means clients only download new additions, not the entire list every time.

## Security

- Session tokens are read locally by the browser extension and never sent to any server
- All admin operations are enforced by Supabase Row Level Security (RLS)
- The entire codebase is open source for audit
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for security reporting guidelines

## License

MIT — see [LICENSE](./LICENSE)
