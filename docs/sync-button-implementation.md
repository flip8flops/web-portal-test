# Web Portal: SYNC Button & Hidden Output Tab Implementation

**Date:** 2025-12-23  
**Status:** Implemented

---

## 1. Feature Requirements

### 1.1 SYNC Button
- Muncul di tab Input, di bagian status display
- Hanya muncul jika dan hanya jika Guardrails Out (guardrails_qc) status = completed
- Click → trigger webhook ke n8n untuk sync ke Citia DB
- Jika page di-refresh, status hilang dan button SYNC juga hilang (as designed)

### 1.2 Hidden Output Tab
- Default: Output tab **hidden** (tidak muncul di tab list)
- Toggle: Double-click pada title "Broadcast Team Agent" untuk show/hide
- Jika page di-refresh, kembali ke default (hidden)
- Ini untuk internal use only, belum ekspos ke admin Citia

---

## 2. Implementation Details

### 2.1 SYNC Button

**Location:** `components/broadcast/status-display.tsx`

**Logic:**
```typescript
// Check if guardrails_qc is completed
const isGuardrailsQCCompleted = statuses['guardrails_qc']?.status === 'completed';

// Show SYNC button only when guardrails_qc is completed
{isGuardrailsQCCompleted && (
  <Button onClick={handleSync} disabled={syncing}>
    {syncing ? 'Syncing...' : 'SYNC'}
  </Button>
)}
```

**Webhook Call:**
```typescript
const handleSync = async () => {
  setSyncing(true);
  try {
    const response = await fetch('/api/broadcast/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId })
    });
    // Handle response
  } catch (error) {
    // Handle error
  } finally {
    setSyncing(false);
  }
};
```

### 2.2 API Endpoint for SYNC

**File:** `app/api/broadcast/sync/route.ts`

**Flow:**
1. Receive request from frontend
2. Call n8n webhook with basic auth
3. Return success/error response

**Environment Variables:**
```env
N8N_WEBHOOK_SYNC_URL=https://ot2.metagapura.com/webhook/b36f7a13-0c1d-4053-99c4-e93530121745
N8N_WEBHOOK_USERNAME=<existing>
N8N_WEBHOOK_PASSWORD=<existing>
```

### 2.3 Hidden Output Tab

**Location:** `app/broadcast/page.tsx`

**State:**
```typescript
const [showOutputTab, setShowOutputTab] = useState(false);
```

**Toggle Handler:**
```typescript
const handleTitleDoubleClick = () => {
  setShowOutputTab(prev => !prev);
};
```

**UI:**
```tsx
<h1 
  className="..." 
  onDoubleClick={handleTitleDoubleClick}
  style={{ cursor: 'default', userSelect: 'none' }}
>
  Broadcast Team Agent
</h1>

<TabsList>
  <TabsTrigger value="input">Input</TabsTrigger>
  {showOutputTab && (
    <TabsTrigger value="output">Output</TabsTrigger>
  )}
</TabsList>
```

---

## 3. Testing Checklist

- [ ] SYNC button tidak muncul saat awal load (belum ada proses)
- [ ] SYNC button tidak muncul saat Guardrails In processing
- [ ] SYNC button tidak muncul saat Content Maker processing
- [ ] SYNC button MUNCUL saat Guardrails Out = completed
- [ ] Click SYNC → loading state
- [ ] SYNC success → toast/alert
- [ ] SYNC error → error message
- [ ] Page refresh → SYNC button hilang (status cleared)
- [ ] Double-click title → Output tab muncul
- [ ] Double-click lagi → Output tab hilang
- [ ] Page refresh → Output tab kembali hidden

---

*Document Version: 1.0*
