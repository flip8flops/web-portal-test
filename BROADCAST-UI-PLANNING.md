# Broadcast Team Agent UI - Implementation Planning

**Date:** 2025-12-10  
**Purpose:** Planning untuk implementasi UI minimal Broadcast Team Agent di web portal

## 🎯 Requirements

### UI Components:
1. ✅ **Tab baru "Broadcast"** setelah tab "Notes" di sidebar
2. ✅ **Status loading per agent** - Real-time status display
3. ✅ **Form input** - Text area untuk campaign brief dengan hint
4. ✅ **Image upload** - Drag & drop dengan thumbnail preview
5. ✅ **Generate button** - Trigger n8n workflow webhook

### Access Control:
- ✅ Perlu login (sama seperti Notes page)
- ✅ Protected route dengan session validation

---

## 🤔 Status Updates Strategy - Analysis

### Option 1: HTTP Request dari n8n ke Web Portal Endpoint ❌
**Approach:** n8n workflow mengirim HTTP Request ke web portal API endpoint setiap kali ada status update.

**Pros:**
- Simple implementation
- Direct communication

**Cons:**
- ❌ Web portal harus publicly accessible (untuk n8n bisa call)
- ❌ Security concern (expose endpoint ke internet)
- ❌ Network dependency (n8n harus bisa reach web portal)
- ❌ No persistence (status hilang kalau user refresh)
- ❌ Hard to scale (multiple users, multiple campaigns)

### Option 2: Supabase Realtime (Recommended) ✅
**Approach:** 
1. n8n workflow store status di Supabase table (`campaign_status_updates`)
2. Frontend subscribe ke Supabase Realtime untuk real-time updates

**Pros:**
- ✅ Secure (Supabase handles auth & RLS)
- ✅ Persistent (status tersimpan di database)
- ✅ Scalable (multiple users, multiple campaigns)
- ✅ No network dependency (n8n & web portal hanya perlu akses Supabase)
- ✅ Real-time via Supabase Realtime subscriptions
- ✅ History tracking (bisa lihat status history)

**Cons:**
- Slightly more complex (tapi masih manageable)

### Option 3: Polling dari Frontend ⚠️
**Approach:** Frontend polling API endpoint setiap X seconds untuk check status.

**Pros:**
- Simple implementation
- No real-time infrastructure needed

**Cons:**
- ❌ Not real-time (delay)
- ❌ Inefficient (unnecessary requests)
- ❌ Battery drain (mobile)
- ❌ Still need endpoint untuk store status

### **Recommendation: Option 2 (Supabase Realtime)** ✅

**Implementation:**
1. Create table `campaign_status_updates` di Supabase
2. n8n workflow insert/update status di table ini
3. Frontend subscribe ke Supabase Realtime untuk real-time updates
4. Display status di UI dengan real-time updates

---

## 📋 Implementation Plan

### Phase 1: Database Setup (Supabase)

**Schema Decision:** ✅ `citia_mora_datamart`
- Table ini bagian dari agent workflow, bukan raw data
- Related dengan `campaign` table yang ada di schema ini
- Consistent dengan struktur datamart yang sudah ada

#### 1.1 Create `campaign_status_updates` Table
```sql
-- Schema: citia_mora_datamart (confirmed)
CREATE TABLE IF NOT EXISTS citia_mora_datamart.campaign_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES citia_mora_datamart.campaign(id) ON DELETE CASCADE,
  execution_id TEXT, -- n8n execution ID untuk tracking
  agent_name TEXT NOT NULL, -- 'guardrails', 'research_agent', 'matchmaker_agent'
  status TEXT NOT NULL, -- 'thinking', 'processing', 'completed', 'error', 'rejected'
  message TEXT, -- Human-readable message (e.g., "Research Agent sedang menganalisis campaign...")
  progress INTEGER DEFAULT 0, -- 0-100 untuk progress bar (optional)
  error_message TEXT, -- Error message jika status = 'error'
  metadata JSONB, -- Additional metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk performance
CREATE INDEX idx_campaign_status_updates_campaign_id ON citia_mora_datamart.campaign_status_updates(campaign_id);
CREATE INDEX idx_campaign_status_updates_created_at ON citia_mora_datamart.campaign_status_updates(created_at DESC);

-- RLS Policies (optional, jika perlu user isolation)
ALTER TABLE citia_mora_datamart.campaign_status_updates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view status updates for campaigns they created
-- (Note: Ini perlu adjust sesuai auth structure Citia)
CREATE POLICY "Users can view campaign status updates"
  ON citia_mora_datamart.campaign_status_updates FOR SELECT
  USING (true); -- Temporary: allow all, adjust later based on auth
```

#### 1.2 Create Function untuk Latest Status per Campaign
```sql
-- Function untuk get latest status per agent untuk campaign
CREATE OR REPLACE FUNCTION citia_mora_datamart.get_latest_campaign_status(
  p_campaign_id UUID
)
RETURNS TABLE (
  agent_name TEXT,
  status TEXT,
  message TEXT,
  progress INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (csu.agent_name)
    csu.agent_name,
    csu.status,
    csu.message,
    csu.progress,
    csu.updated_at
  FROM citia_mora_datamart.campaign_status_updates csu
  WHERE csu.campaign_id = p_campaign_id
  ORDER BY csu.agent_name, csu.updated_at DESC;
END;
$$ LANGUAGE plpgsql;
```

---

### Phase 2: Web Portal Implementation

#### 2.1 Add "Broadcast" Tab di Sidebar
**File:** `components/sidebar.tsx`

**Changes:**
- Add new nav item: `{ href: '/broadcast', label: 'Broadcast', icon: Radio }`
- Import `Radio` icon dari `lucide-react`

#### 2.2 Create Broadcast Page
**File:** `app/broadcast/page.tsx`

**Features:**
- Protected route (check session)
- Status display area (top section)
- Form input area (middle section)
- Image upload area (bottom section)
- Generate button

**Components:**
- `StatusDisplay` - Component untuk display status per agent
- `CampaignForm` - Component untuk form input
- `ImageUpload` - Component untuk drag & drop image upload

#### 2.3 Create API Route untuk Trigger Workflow
**File:** `app/api/broadcast/create/route.ts`

**Function:**
- Accept POST request dengan `notes` (text) dan `image` (file)
- Validate session
- Call n8n webhook: `N8N_CITIA_CAMPAIGN_WEBHOOK_URL`
- Send multipart/form-data dengan:
  - `Campaign planning notes`: notes text
  - `Campaign image`: image file (if provided)
- Return `campaign_id` dan `execution_id` untuk tracking

**Environment Variables:**
```env
N8N_CITIA_CAMPAIGN_WEBHOOK_URL=https://ot2.metagapura.com/webhook/5a684c54-cabc-41d3-b375-7cc24c4912a6
N8N_CITIA_CAMPAIGN_WEBHOOK_USER=your-webhook-username
N8N_CITIA_CAMPAIGN_WEBHOOK_PASS=your-webhook-password
```

#### 2.4 Create API Route untuk Get Status (Optional - untuk fallback)
**File:** `app/api/broadcast/[campaign_id]/status/route.ts`

**Function:**
- GET request dengan `campaign_id`
- Query `campaign_status_updates` table
- Return latest status per agent

**Note:** Ini optional karena kita akan pakai Supabase Realtime. Tapi bisa jadi fallback kalau Realtime connection drop.

#### 2.5 Create Status Display Component
**File:** `components/broadcast/status-display.tsx`

**Features:**
- Display status per agent (Guardrails, Research Agent, Matchmaker Agent)
- Real-time updates via Supabase Realtime subscription
- Visual indicators:
  - ⏳ Thinking/Processing
  - ✅ Completed
  - ❌ Error
  - 🚫 Rejected (Guardrails)

**Status Messages:**
- Guardrails: "Validating campaign input..."
- Research Agent: "🤯 Research Agent sedang menganalisis campaign..."
- Matchmaker Agent: "🎯 Matchmaker Agent sedang mencari audience..."

#### 2.6 Create Campaign Form Component
**File:** `components/broadcast/campaign-form.tsx`

**Features:**
- Text area untuk campaign brief
- Character counter (optional)
- Hint text: "Masukkan campaign brief Anda di sini..."
- Validation: minimum length, max length

#### 2.7 Create Image Upload Component
**File:** `components/broadcast/image-upload.tsx`

**Features:**
- Drag & drop area
- Click to upload
- Image preview (thumbnail)
- Remove image button
- File validation (jpg, jpeg, png, webp)
- Max file size validation (e.g., 5MB)

---

### Phase 3: n8n Workflow Updates

#### 3.1 Add HTTP Request Nodes untuk Status Updates

**Key Points untuk Status Updates:**

1. **After Guardrails** (Accept/Reject)
   - Node: "Update Status - Guardrails"
   - Insert status: `{ agent_name: 'guardrails', status: 'completed', message: 'Campaign input validated' }` atau `{ status: 'rejected', message: 'Campaign input tidak sesuai topik' }`

2. **Research Agent - Thinking**
   - Node: "Update Status - Research Thinking"
   - Insert status: `{ agent_name: 'research_agent', status: 'thinking', message: 'Research Agent sedang menganalisis campaign...' }`

3. **Research Agent - Completed**
   - Node: "Update Status - Research Completed"
   - Insert status: `{ agent_name: 'research_agent', status: 'completed', message: 'Research Agent selesai menganalisis campaign' }`

4. **Matchmaker Agent - Thinking**
   - Node: "Update Status - Matchmaker Thinking"
   - Insert status: `{ agent_name: 'matchmaker_agent', status: 'thinking', message: 'Matchmaker Agent sedang mencari audience...' }`

5. **Matchmaker Agent - Completed**
   - Node: "Update Status - Matchmaker Completed"
   - Insert status: `{ agent_name: 'matchmaker_agent', status: 'completed', message: 'Matchmaker Agent selesai mencocokkan audience' }`

6. **Error Handling**
   - Catch errors di setiap agent
   - Insert status: `{ agent_name: 'xxx', status: 'error', error_message: '...' }`

**HTTP Request Node Configuration:**
```javascript
// Method: POST
// URL: https://mrowfxhfkiforbhcaatz.supabase.co/rest/v1/campaign_status_updates
// Headers:
//   apikey: {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
//   Authorization: Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
//   Content-Type: application/json
//   Prefer: return=representation
// Body (JSON):
{
  "campaign_id": "{{ $('Insert Campaign').item.json.id }}",
  "execution_id": "{{ $execution.id }}",
  "agent_name": "research_agent",
  "status": "thinking",
  "message": "Research Agent sedang menganalisis campaign...",
  "progress": 0,
  "metadata": {
    "execution_url": "{{ $execution.resumeUrl }}"
  }
}
```

**Note:** Perlu tambahkan Supabase credentials di n8n:
- `SUPABASE_SERVICE_ROLE_KEY` - Untuk insert ke table
- `SUPABASE_URL` - Supabase project URL

#### 3.2 Update Workflow Flow

**Flow dengan Status Updates:**

```
Webhook Trigger
  ↓
Prepare Research Payload
  ↓
[Update Status: Guardrails - Processing]
  ↓
Guardrails (Topical Alignment)
  ↓
[Update Status: Guardrails - Completed/Rejected]
  ↓
IF Rejected → [Update Status: Rejected] → End
  ↓
IF Accepted → Analyze Image (if exists)
  ↓
Build Agent Payload
  ↓
[Update Status: Research Agent - Thinking]
  ↓
Research Agent
  ↓
[Update Status: Research Agent - Completed]
  ↓
Insert Campaign
  ↓
Prepare Matchmaker Input
  ↓
[Update Status: Matchmaker Agent - Thinking]
  ↓
Matchmaker Agent
  ↓
[Update Status: Matchmaker Agent - Completed]
  ↓
Insert Campaign Audience
  ↓
Update Campaign Status
  ↓
End
```

#### 3.3 Error Handling Nodes

**Add Try-Catch Pattern:**
- Wrap setiap agent dengan error handling
- On error: Insert status dengan `status: 'error'`
- Continue atau stop workflow based on error type

---

## 📁 File Structure (New Files)

```
web-portal-test/
├── app/
│   ├── broadcast/
│   │   └── page.tsx                    # Main broadcast page ⭐
│   └── api/
│       └── broadcast/
│           ├── create/
│           │   └── route.ts            # Trigger workflow ⭐
│           └── [campaign_id]/
│               └── status/
│                   └── route.ts       # Get status (optional)
├── components/
│   ├── broadcast/
│   │   ├── status-display.tsx         # Status display component ⭐
│   │   ├── campaign-form.tsx           # Campaign form component ⭐
│   │   └── image-upload.tsx            # Image upload component ⭐
│   └── sidebar.tsx                     # Updated with Broadcast tab
└── src/lib/
    └── supabase/
        └── realtime.ts                 # Supabase Realtime helper (optional)
```

---

## 🔧 Environment Variables

### Web Portal (.env.local):
```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# New: Citia Campaign Webhook
N8N_CITIA_CAMPAIGN_WEBHOOK_URL=https://ot2.metagapura.com/webhook/5a684c54-cabc-41d3-b375-7cc24c4912a6
N8N_CITIA_CAMPAIGN_WEBHOOK_USER=your-webhook-username
N8N_CITIA_CAMPAIGN_WEBHOOK_PASS=your-webhook-password
```

### n8n Workflow (n8n Environment Variables):
```env
SUPABASE_URL=https://mrowfxhfkiforbhcaatz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 🎨 UI Design (Wireframe Implementation)

### Layout Structure:
```
┌─────────────────────────────────────────────────┐
│  Sidebar  │  Main Content Area                  │
│           │                                      │
│  - Dashboard                                    │
│  - Notes                                        │
│  - Broadcast  ← New Tab                         │
│           │                                      │
│           │  ┌─────────────────────────────┐   │
│           │  │ Status Display Area          │   │
│           │  │ - Guardrails: ✅ Completed   │   │
│           │  │ - Research: ⏳ Thinking...   │   │
│           │  │ - Matchmaker: ⏸️ Waiting    │   │
│           │  └─────────────────────────────┘   │
│           │                                      │
│           │  ┌─────────────────────────────┐   │
│           │  │ Campaign Brief               │   │
│           │  │ ┌─────────────────────────┐  │   │
│           │  │ │ Your notes              │  │   │
│           │  │ │ [Text area with hint]   │  │   │
│           │  │ └─────────────────────────┘  │   │
│           │  └─────────────────────────────┘   │
│           │                                      │
│           │  ┌─────────────────────────────┐   │
│           │  │ Additional image to send     │   │
│           │  │ ┌─────────────────────────┐  │   │
│           │  │ │ [Drag & drop area]      │  │   │
│           │  │ │ [Image thumbnail]       │  │   │
│           │  │ └─────────────────────────┘  │   │
│           │  └─────────────────────────────┘   │
│           │                                      │
│           │              [GENERATE] ← Button    │
│           └─────────────────────────────────────┘
```

---

## ✅ Implementation Checklist

### Database Setup:
- [ ] Create `campaign_status_updates` table
- [ ] Create indexes
- [ ] Create RLS policies (if needed)
- [ ] Create helper function `get_latest_campaign_status`

### Web Portal:
- [ ] Update sidebar dengan Broadcast tab
- [ ] Create `/broadcast` page
- [ ] Create `StatusDisplay` component
- [ ] Create `CampaignForm` component
- [ ] Create `ImageUpload` component
- [ ] Create API route `/api/broadcast/create`
- [ ] Create API route `/api/broadcast/[campaign_id]/status` (optional)
- [ ] Implement Supabase Realtime subscription
- [ ] Add environment variables

### n8n Workflow:
- [ ] Add HTTP Request node: Guardrails status
- [ ] Add HTTP Request node: Research Agent thinking
- [ ] Add HTTP Request node: Research Agent completed
- [ ] Add HTTP Request node: Matchmaker Agent thinking
- [ ] Add HTTP Request node: Matchmaker Agent completed
- [ ] Add error handling nodes
- [ ] Add Supabase credentials di n8n
- [ ] Test status updates flow

### Testing:
- [ ] Test campaign creation dengan notes only
- [ ] Test campaign creation dengan notes + image
- [ ] Test real-time status updates
- [ ] Test Guardrails rejection flow
- [ ] Test error handling
- [ ] Test multiple campaigns simultaneously

---

## 🚀 Next Steps

1. **Start dengan Database Setup** - Create table dan indexes
2. **Implement Web Portal UI** - Create page dan components
3. **Add n8n Status Updates** - Update workflow dengan HTTP Request nodes
4. **Test End-to-End** - Verify real-time updates work
5. **Polish UI** - Improve styling dan UX

---

## 📝 Notes

- **Status Updates:** Menggunakan Supabase Realtime untuk real-time updates (recommended approach)
- **Security:** RLS policies bisa ditambahkan later untuk user isolation
- **Scalability:** Approach ini scalable untuk multiple users dan campaigns
- **Error Handling:** Comprehensive error handling di n8n workflow
- **Future:** Bisa extend dengan progress bar, estimated time, dll

