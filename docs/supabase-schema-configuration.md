# Supabase Schema Configuration for Data API

## 🎯 Solution: Expose Schema in Data API Settings

**Tidak perlu membuat view di public schema** jika schema `citia_mora_datamart` sudah di-expose di Supabase Data API settings.

## ✅ Configuration Steps

### Step 1: Supabase Dashboard → Settings → Data API

1. Login ke **Supabase Dashboard**
2. Pilih project
3. Buka **Settings** → **Data API**
4. Scroll ke **"Exposed schemas"**
5. **Tambahkan schema**: `CITIA_MORA_DATAMART`
6. (Optional) Tambahkan juga ke **"Extra search path"**
7. **Save**

### Step 2: Verify Configuration

**Exposed schemas** harus berisi:
- `PUBLIC` (default)
- `GRAPHQL_PUBLIC` (default)
- `TEST` (default)
- `CITIA_MORA_DATAMART` ✅ (added)
- `CITIA_BROADCAST_RAW` (if needed)

**Extra search path** (optional):
- `PUBLIC`
- `EXTENSIONS`
- `TEST`
- `CITIA_MORA_DATAMART` ✅ (added)
- `CITIA_BROADCAST_RAW` (if needed)

## 📋 Code Usage

Setelah schema di-expose, kita bisa langsung query:

```typescript
// Direct query to citia_mora_datamart schema
supabase
  .schema('citia_mora_datamart')
  .from('campaign_status_updates')
  .select('...')
```

**Realtime subscription:**
```typescript
supabase
  .channel('...')
  .on('postgres_changes', {
    event: '*',
    schema: 'citia_mora_datamart',  // Direct schema
    table: 'campaign_status_updates',
    filter: '...',
  })
```

## 🔍 Troubleshooting

### Issue 1: Still getting PGRST106 error

**Problem**: Schema not exposed

**Solution**:
- Double-check "Exposed schemas" includes `CITIA_MORA_DATAMART`
- Ensure you clicked "Save" after adding schema
- Wait a few seconds for changes to propagate

### Issue 2: Realtime not working

**Problem**: Schema not in search path or Realtime not enabled

**Solution**:
- Add schema to "Extra search path" (optional but recommended)
- Ensure Realtime is enabled for the table (see `002_enable_realtime.sql`)

### Issue 3: Permission denied

**Problem**: RLS or permissions not set

**Solution**:
- Check table permissions in `citia_mora_datamart.campaign_status_updates`
- Ensure `GRANT SELECT` is set for `authenticated` and `anon` roles

## 📝 Related Files

- `components/broadcast/status-display.tsx` - Uses `.schema('citia_mora_datamart')`
- `supabase/migrations/002_enable_realtime.sql` - Enables Realtime for table
- `docs/supabase-schema-fix.md` - Alternative solution using view (not needed if schema exposed)

## ✅ Checklist

- [x] Schema `CITIA_MORA_DATAMART` added to "Exposed schemas"
- [ ] (Optional) Schema added to "Extra search path"
- [ ] Settings saved in Supabase Dashboard
- [ ] Test query from web portal
- [ ] Verify status updates appear in UI
- [ ] Test real-time subscription works

