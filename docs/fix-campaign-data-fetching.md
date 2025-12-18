# Fix Campaign Data Fetching - Dokumentasi Pembelajaran

## Masalah yang Ditemukan

### Error: `column campaign.image_url does not exist`

**Gejala:**
- Campaign data (title, objective, origin notes, tags) tidak muncul di web portal
- Log Coolify menunjukkan error: `column campaign.image_url does not exist` dengan code `42703`
- API fallback ke data minimal karena query ke tabel `campaign` gagal

**Penyebab:**
Query SELECT mencoba mengambil kolom `image_url` yang tidak ada di tabel `campaign` di database Supabase.

```typescript
// ❌ SALAH - kolom image_url tidak ada
.select('id, name, objective, image_url, meta, matchmaker_strategy, created_at, updated_at')
```

**Solusi:**
Hapus `image_url` dari SELECT query dan semua referensi ke `campaignImageUrl`:

1. **Hapus dari SELECT query:**
```typescript
// ✅ BENAR
.select('id, name, objective, meta, matchmaker_strategy, created_at, updated_at')
```

2. **Hapus variable declaration:**
```typescript
// ❌ Hapus ini
let campaignImageUrl = null;
```

3. **Hapus dari response object:**
```typescript
// ❌ Hapus campaign_image_url dari response
draft: {
  campaign_id: latestDraftCampaignId,
  campaign_name: campaignName,
  campaign_objective: campaignObjective,
  campaign_image_url: campaignImageUrl, // ❌ HAPUS
  // ...
}
```

## Lesson Learned

1. **Selalu cek struktur tabel database sebelum query**
   - Gunakan script `check-supabase-permissions.js` untuk cek kolom yang ada
   - Atau query `information_schema.columns` untuk melihat struktur tabel

2. **Error handling yang baik**
   - Log error dengan detail (code, message, details, hint)
   - Jangan hanya log "Cannot access table" tanpa detail error

3. **TypeScript build error**
   - Pastikan semua variable yang digunakan sudah dideklarasikan
   - TypeScript akan error jika variable tidak ada meskipun di runtime mungkin tidak crash

4. **Database schema changes**
   - Jika kolom tidak ada, jangan force query
   - Cek dulu apakah kolom benar-benar ada atau perlu dibuat

## File yang Diubah

- `app/api/drafts/route.ts`
  - Removed `image_url` from SELECT query
  - Removed `campaignImageUrl` variable
  - Removed `campaign_image_url` from response objects

## Commit History

1. `aca59a4` - Fix: Remove image_url column from campaign query - column does not exist in database
2. `f80c885` - Fix: Remove all image_url references - TypeScript build error
3. `2e3dc9c` - Fix: Remove campaign_image_url from fallback response
