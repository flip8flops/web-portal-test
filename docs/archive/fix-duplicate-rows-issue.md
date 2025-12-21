# Fix Duplicate Rows Issue - Root Cause Analysis

## Problem

Edit save functionality tidak bekerja dengan benar. Setelah save, tampilan web tidak menunjukkan perubahan terbaru.

### Symptoms
- Save berhasil (status 200, "Content saved successfully")
- Database menunjukkan content baru (e.g., "Dummy O")
- Web masih menampilkan content lama (e.g., "Dummy M")

### Root Cause

**Ada MULTIPLE ROWS dengan campaign_id + audience_id yang sama di tabel `campaign_audience`.**

Dari screenshot Supabase DB terlihat **4 rows** untuk campaign `08c81b22-2f72-465b-8b59-d1df298944ed`:

```
Row 1: id=640b6b6a... audience_id=e29db435... updated_at=15:44:44  content="Dummy O"
Row 2: id=436f8b30... audience_id=29452509... updated_at=13:22:16  content="Bardo..."
Row 3: id=96163b13... (duplicate?)
Row 4: id=0c96f76e... (duplicate?)
```

### Why This Causes Issues

1. **Update** mungkin hit row yang benar (Row 1 dengan ID `640b6b6a...`)
2. **Fetch** menggunakan `order by updated_at DESC` tapi mungkin mengambil row duplicate yang tidak ter-update
3. Tidak ada UNIQUE constraint di database untuk `(campaign_id, audience_id)`

## Solution

### Short-term Fix (Current)
- Update ALL rows dengan campaign_id + audience_id yang sama
- Log semua existing rows sebelum update
- Warn jika ada duplicates

### Long-term Fix (Recommended)
1. **Add UNIQUE constraint** di database:
   ```sql
   ALTER TABLE citia_mora_datamart.campaign_audience 
   ADD CONSTRAINT unique_campaign_audience UNIQUE (campaign_id, audience_id);
   ```

2. **Cleanup duplicates** sebelum add constraint:
   ```sql
   -- Keep only the latest row per (campaign_id, audience_id)
   DELETE FROM citia_mora_datamart.campaign_audience ca
   WHERE ca.id NOT IN (
     SELECT DISTINCT ON (campaign_id, audience_id) id
     FROM citia_mora_datamart.campaign_audience
     ORDER BY campaign_id, audience_id, updated_at DESC
   );
   ```

3. **Use upsert** instead of update:
   ```typescript
   .upsert({
     campaign_id,
     audience_id,
     broadcast_content,
     updated_at,
   }, {
     onConflict: 'campaign_id,audience_id',
   })
   ```

## Files Changed

- `app/api/drafts/update-content/route.ts` - Added duplicate detection and logging
- `docs/fix-duplicate-rows-issue.md` - This documentation

## Next Steps

1. Test the update with new logging to confirm duplicate rows
2. Run cleanup SQL to remove duplicates
3. Add UNIQUE constraint to prevent future duplicates
4. Switch to upsert pattern instead of update
