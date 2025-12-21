# Fix: Supabase Schema Error (PGRST106)

## 🎯 Problem

**Error di Console:**
```
GET 406 (Not Acceptable)
PGRST106: The schema must be one of the following: public, graphql_public, test
```

**Root Cause:**
Supabase PostgREST API hanya mengizinkan query ke schema `public`, `graphql_public`, atau `test`. Query langsung ke schema `citia_mora_datamart` tidak diizinkan.

**Code yang bermasalah:**
```typescript
supabase
  .schema('citia_mora_datamart')  // ❌ Not allowed
  .from('campaign_status_updates')
```

## ✅ Solution

### Option 1: Create View in Public Schema (Recommended)

Buat view di schema `public` yang mengakses table di `citia_mora_datamart`.

**Migration SQL:**
```sql
CREATE OR REPLACE VIEW public.campaign_status_updates AS
SELECT 
  id,
  campaign_id,
  execution_id,
  agent_name,
  status,
  message,
  progress,
  error_message,
  metadata,
  created_at,
  updated_at
FROM citia_mora_datamart.campaign_status_updates;

GRANT SELECT ON public.campaign_status_updates TO authenticated;
GRANT SELECT ON public.campaign_status_updates TO anon;
```

**Update Code:**
```typescript
// Remove .schema() - defaults to public
supabase
  .from('campaign_status_updates')  // ✅ Uses public view
  .select('...')
```

### Option 2: Use RPC Function

Buat stored function di public schema yang query ke citia_mora_datamart.

**Migration SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_campaign_status_updates(
  p_execution_id TEXT DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS TABLE (
  agent_name TEXT,
  status TEXT,
  message TEXT,
  progress INTEGER,
  updated_at TIMESTAMPTZ,
  campaign_id UUID,
  execution_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    csu.agent_name,
    csu.status,
    csu.message,
    csu.progress,
    csu.updated_at,
    csu.campaign_id,
    csu.execution_id
  FROM citia_mora_datamart.campaign_status_updates csu
  WHERE 
    (p_execution_id IS NULL OR csu.execution_id = p_execution_id)
    AND (p_campaign_id IS NULL OR csu.campaign_id = p_campaign_id)
  ORDER BY csu.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_campaign_status_updates TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_status_updates TO anon;
```

**Update Code:**
```typescript
const { data, error } = await supabase
  .rpc('get_campaign_status_updates', {
    p_execution_id: executionId,
    p_campaign_id: campaignId !== 'pending' ? campaignId : null
  });
```

## 📋 Implementation (Using View - Recommended)

### Step 1: Run Migration

Jalankan migration SQL di Supabase:
```bash
# Via Supabase Dashboard SQL Editor, atau
psql -h <host> -U <user> -d <database> -f supabase/migrations/003_create_status_updates_view.sql
```

### Step 2: Update Code

File: `components/broadcast/status-display.tsx`

**Before:**
```typescript
supabase
  .schema('citia_mora_datamart')
  .from('campaign_status_updates')
```

**After:**
```typescript
supabase
  .from('campaign_status_updates')  // Uses public view
```

### Step 3: Update Realtime Subscription

**Before:**
```typescript
schema: 'citia_mora_datamart',
table: 'campaign_status_updates',
```

**After:**
```typescript
schema: 'public',
table: 'campaign_status_updates',  // View in public schema
```

## 🧪 Testing

### Step 1: Verify View Creation

```sql
-- Check if view exists
SELECT * FROM public.campaign_status_updates LIMIT 1;

-- Check permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'campaign_status_updates' 
  AND table_schema = 'public';
```

### Step 2: Test Query from Web Portal

1. Open Console (F12)
2. Click GENERATE
3. Check Console logs:
   - ✅ No more `PGRST106` error
   - ✅ `StatusDisplay: Fetched statuses: X records` (X > 0)
   - ✅ Status appears in UI

### Step 3: Test Realtime Subscription

1. Verify subscription status:
   ```
   ✅ StatusDisplay: Real-time subscription active
   ```
2. Check if updates appear in real-time when n8n inserts new status

## 🔍 Troubleshooting

### Issue 1: View returns empty results

**Check:**
- Is data actually in `citia_mora_datamart.campaign_status_updates`?
- Does view have correct SELECT statement?
- Are permissions granted correctly?

**Solution:**
```sql
-- Test direct query
SELECT * FROM citia_mora_datamart.campaign_status_updates LIMIT 1;

-- Test view
SELECT * FROM public.campaign_status_updates LIMIT 1;
```

### Issue 2: Realtime subscription not working

**Problem**: View might not trigger Realtime events

**Solution:**
- Realtime works on views, but ensure the underlying table has Realtime enabled
- Check if `citia_mora_datamart.campaign_status_updates` has Realtime enabled

### Issue 3: Permission denied

**Problem**: `GRANT SELECT` not working

**Solution:**
```sql
-- Re-grant permissions
GRANT SELECT ON public.campaign_status_updates TO authenticated;
GRANT SELECT ON public.campaign_status_updates TO anon;

-- Verify
SELECT * FROM information_schema.role_table_grants 
WHERE table_name = 'campaign_status_updates';
```

## 📝 Related Files

- `supabase/migrations/003_create_status_updates_view.sql` - Migration untuk create view
- `components/broadcast/status-display.tsx` - Updated component
- `docs/supabase-schema-fix.md` - This documentation

## ✅ Checklist

- [ ] Run migration SQL to create view
- [ ] Update StatusDisplay component (remove `.schema()`)
- [ ] Update Realtime subscription (use `public` schema)
- [ ] Test query from web portal
- [ ] Verify status updates appear in UI
- [ ] Test real-time subscription works

