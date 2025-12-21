# Migration Guide - campaign_status_updates Table

## Quick Setup

### Option 1: Execute via Supabase SQL Editor (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **SQL Editor**
4. Copy the SQL from `supabase/migrations/001_create_campaign_status_updates.sql`
5. Paste and click **Run**

### Option 2: Execute via Script (Requires Database Credentials)

1. Get your Supabase database connection string:
   - Go to Supabase Dashboard > Settings > Database
   - Copy the **Connection string** (or Connection pooling string)

2. Set environment variable:
   ```bash
   # In .env.local or export in terminal
   export SUPABASE_DB_CONNECTION_STRING="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
   ```

3. Run the script:
   ```bash
   node scripts/create-table-supabase.js
   ```

### Option 3: Execute via Script with Individual Credentials

1. Set environment variables:
   ```bash
   export SUPABASE_DB_HOST="db.xxxxx.supabase.co"
   export SUPABASE_DB_PASSWORD="your-password"
   export SUPABASE_DB_PORT="5432"  # optional, default 5432
   export SUPABASE_DB_NAME="postgres"  # optional, default postgres
   export SUPABASE_DB_USER="postgres"  # optional, default postgres
   ```

2. Run the script:
   ```bash
   node scripts/create-table-supabase.js
   ```

## Verification

After running the migration, verify the table was created:

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'citia_mora_datamart' 
  AND table_name = 'campaign_status_updates'
);

-- View table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'citia_mora_datamart' 
AND table_name = 'campaign_status_updates'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'citia_mora_datamart' 
AND tablename = 'campaign_status_updates';

-- Check functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'citia_mora_datamart' 
AND routine_name LIKE '%campaign_status%';
```

## What Gets Created

- ✅ Table: `citia_mora_datamart.campaign_status_updates`
- ✅ 3 Indexes for performance
- ✅ Trigger for auto-updating `updated_at`
- ✅ Function: `get_latest_campaign_status()`

## Next Steps

After the table is created:
1. Test real-time subscriptions in the UI
2. Update n8n workflow to insert status updates
3. Verify status updates appear in real-time

