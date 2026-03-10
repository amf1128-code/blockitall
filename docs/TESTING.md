# Testing Guide

## End-to-End Testing Checklist

Walk through this checklist to verify the full pipeline works. Takes about 10 minutes.

### Prerequisites

- Admin dashboard running locally or deployed
- Logged in as admin
- Test List created (slug: `test-list`)
- Browser extension installed (Phase 2)

### Test 1: Add an Account via Admin Dashboard

1. Navigate to Block Lists > Test List
2. Click "Add Account"
3. Enter a test handle (e.g., `test_bot_account_1`)
4. Verify it appears in the list
5. Verify the account count incremented

### Test 2: Bulk Import

1. On the Test List page, click "Bulk Import"
2. Paste the following:
   ```
   @test_handle_a
   test_handle_b
   invalid handle with spaces
   test_handle_a
   ```
3. Verify results: 2 added, 1 invalid, 1 duplicate

### Test 3: API Endpoint (curl)

```bash
# Replace with your Supabase Edge Function URL
FUNCTION_URL="https://your-project.supabase.co/functions/v1/lists"

# Fetch all lists
curl "$FUNCTION_URL"

# Fetch test list accounts
curl "$FUNCTION_URL/test-list/accounts"

# Fetch only accounts added after a timestamp (incremental sync)
curl "$FUNCTION_URL/test-list/accounts?since=2024-01-01T00:00:00Z"
```

### Test 4: Extension Sync (Phase 2)

1. Open the extension popup
2. Verify it detects your Twitter session ("Connected as @yourhandle")
3. Subscribe to the Test List
4. Click "Sync" and verify it picks up the test accounts
5. Run a **dry run** block — verify it appears in the debug log
6. Run an actual block and verify using the "Verify Blocks" button
7. Check the block action log in the admin dashboard (if opt-in logging is on)

### Test 5: Remove and Re-sync

1. In the admin dashboard, remove a handle from the Test List
2. Open the extension and sync again
3. Verify the extension reflects the updated list

### Test 6: Handle Validation

Try adding these handles in the admin dashboard and verify correct behavior:

| Input | Expected |
|-------|----------|
| `@validuser` | Accepted (normalized to `validuser`) |
| `UPPERCASE` | Accepted (normalized to `uppercase`) |
| ` spaced ` | Accepted (trimmed) |
| `has spaces` | Rejected (invalid characters) |
| `toolonghandleeeeeee` | Rejected (>15 chars) |
| `` (empty) | Rejected |

### Test 7: RLS Policy Verification

1. Sign out of the admin dashboard
2. Using a non-admin Supabase user, verify:
   - Can read public lists ✓
   - Cannot create/edit/delete lists ✗
   - Cannot add/remove blocked accounts ✗
   - Can read active blocked accounts ✓
   - Can manage own subscriptions ✓
   - Can insert own block actions ✓
