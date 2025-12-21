# Solusi Persistence State Setelah Browser Refresh

## Masalah Saat Ini

1. **Logic restore kurang tepat**: Hanya cek status terakhir, bukan semua agent
2. **Tidak handle edge case**: Jika campaign sudah selesai tapi localStorage belum di-clear
3. **Tidak ada expiry**: localStorage bisa tetap ada selamanya jika tidak di-clear

## Solusi yang Diperlukan

### 1. Perbaiki Logic Restore di `page.tsx`

**Masalah saat ini:**
- Hanya cek 1 status terakhir
- Tidak cek apakah ada agent yang masih processing

**Solusi:**
- Query semua status untuk campaign/execution
- Cek apakah ada agent yang masih `processing` atau `thinking`
- Jika ada yang masih processing → restore state
- Jika semua sudah `completed`/`rejected`/`error` → clear localStorage

### 2. Tambahkan Timestamp untuk Expiry

**Safety measure:**
- Simpan timestamp saat save ke localStorage
- Saat restore, cek apakah sudah lebih dari 24 jam (atau waktu yang ditentukan)
- Jika expired, clear localStorage

### 3. Perbaiki Logic Clear di `status-display.tsx`

**Sudah cukup baik, tapi perlu:**
- Pastikan clear juga saat campaign rejected (semua agent rejected)
- Handle case dimana hanya 1 agent dan sudah completed/rejected

### 4. Handle Edge Cases

- **Case 1**: Campaign baru dibuat tapi belum ada status update → tetap restore (tunggu status muncul)
- **Case 2**: Campaign sudah selesai tapi localStorage belum di-clear → clear saat restore
- **Case 3**: Multiple campaigns (user buka tab baru) → gunakan campaign terbaru atau yang masih processing

## Implementasi Detail

### A. Update `page.tsx` - Restore Logic

```typescript
// Restore campaign session from localStorage
if (session) {
  try {
    const savedCampaignId = localStorage.getItem('current_campaign_id');
    const savedExecutionId = localStorage.getItem('current_execution_id');
    const savedTimestamp = localStorage.getItem('current_campaign_timestamp');
    
    // Check expiry (24 hours)
    if (savedTimestamp) {
      const timestamp = parseInt(savedTimestamp, 10);
      const now = Date.now();
      const hoursSinceSave = (now - timestamp) / (1000 * 60 * 60);
      
      if (hoursSinceSave > 24) {
        console.log('Campaign session expired, clearing localStorage');
        localStorage.removeItem('current_campaign_id');
        localStorage.removeItem('current_execution_id');
        localStorage.removeItem('current_campaign_timestamp');
        setRestoringSession(false);
        return;
      }
    }
    
    if (savedCampaignId || savedExecutionId) {
      // Query ALL status updates untuk campaign/execution
      let query = supabase
        .schema('citia_mora_datamart')
        .from('campaign_status_updates')
        .select('agent_name, status, updated_at');
      
      if (savedCampaignId) {
        query = query.eq('campaign_id', savedCampaignId);
      } else if (savedExecutionId) {
        query = query.eq('execution_id', savedExecutionId);
      }
      
      const { data: allStatuses, error } = await query
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error checking campaign status:', error);
        // Clear on error to be safe
        localStorage.removeItem('current_campaign_id');
        localStorage.removeItem('current_execution_id');
        localStorage.removeItem('current_campaign_timestamp');
        setRestoringSession(false);
        return;
      }
      
      if (allStatuses && allStatuses.length > 0) {
        // Check if ANY agent is still processing
        const hasProcessingAgent = allStatuses.some(
          (status) => status.status === 'processing' || status.status === 'thinking'
        );
        
        // Check if ALL agents are finished
        const allAgents = ['guardrails', 'research_agent', 'matchmaker_agent', 'content_maker_agent'];
        const agentStatuses: Record<string, string> = {};
        
        // Get latest status per agent
        allStatuses.forEach((status) => {
          if (!agentStatuses[status.agent_name] || 
              new Date(status.updated_at) > new Date(agentStatuses[status.agent_name])) {
            agentStatuses[status.agent_name] = status.status;
          }
        });
        
        const allFinished = allAgents.every((agent) => {
          const status = agentStatuses[agent];
          return !status || // Agent belum mulai
                 status === 'completed' || 
                 status === 'rejected' || 
                 status === 'error';
        });
        
        if (hasProcessingAgent) {
          // Masih ada yang processing → restore
          console.log('Campaign still processing, restoring session:', { 
            savedCampaignId, 
            savedExecutionId 
          });
          setCampaignId(savedCampaignId);
          setExecutionId(savedExecutionId);
        } else if (allFinished) {
          // Semua sudah selesai → clear localStorage
          console.log('All agents finished, clearing localStorage');
          localStorage.removeItem('current_campaign_id');
          localStorage.removeItem('current_execution_id');
          localStorage.removeItem('current_campaign_timestamp');
        } else {
          // Edge case: belum ada status atau status tidak lengkap
          // Restore untuk safety (mungkin status belum muncul)
          console.log('Campaign status unclear, restoring session for safety');
          setCampaignId(savedCampaignId);
          setExecutionId(savedExecutionId);
        }
      } else {
        // Tidak ada status → mungkin campaign baru dibuat
        // Restore untuk safety
        console.log('No status found, restoring session (campaign might be new)');
        setCampaignId(savedCampaignId);
        setExecutionId(savedExecutionId);
      }
    }
  } catch (err) {
    console.error('Error restoring campaign session:', err);
  } finally {
    setRestoringSession(false);
  }
}
```

### B. Update `page.tsx` - Save dengan Timestamp

```typescript
// Save to localStorage for persistence
if (data.campaign_id) {
  localStorage.setItem('current_campaign_id', data.campaign_id);
  localStorage.setItem('current_campaign_timestamp', Date.now().toString());
}
if (data.execution_id) {
  localStorage.setItem('current_execution_id', data.execution_id);
}
```

### C. Update `status-display.tsx` - Clear Logic (Sudah OK, tapi bisa diperbaiki)

```typescript
// Clear localStorage when processing is complete
if (!isProcessing && Object.keys(statuses).length > 0) {
  const allAgents = ['guardrails', 'research_agent', 'matchmaker_agent', 'content_maker_agent'];
  const allFinished = allAgents.every((agent) => {
    const status = statuses[agent];
    return !status || // Agent belum mulai (tidak perlu clear)
           status.status === 'completed' || 
           status.status === 'rejected' || 
           status.status === 'error';
  });
  
  if (allFinished) {
    console.log('All agents finished, clearing localStorage');
    localStorage.removeItem('current_campaign_id');
    localStorage.removeItem('current_execution_id');
    localStorage.removeItem('current_campaign_timestamp');
  }
}
```

## Testing Scenarios

1. **Test 1**: Start campaign → refresh browser → harus restore state
2. **Test 2**: Campaign selesai → refresh browser → harus clean (tidak restore)
3. **Test 3**: Campaign rejected → refresh browser → harus clean
4. **Test 4**: Campaign error → refresh browser → harus clean
5. **Test 5**: Campaign baru dibuat (belum ada status) → refresh browser → harus restore
6. **Test 6**: localStorage expired (>24 jam) → refresh browser → harus clean

## File yang Perlu Diubah

1. `app/broadcast/page.tsx`:
   - Update restore logic (line 54-109)
   - Update save logic (line 187-192)

2. `components/broadcast/status-display.tsx`:
   - Update clear logic (line 65-74) - optional, sudah cukup baik
