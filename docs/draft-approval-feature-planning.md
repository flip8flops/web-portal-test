# Draft Approval Feature - Implementation Planning

## 🎯 Objective

Membuat tampilan draft approval di web portal untuk admin Citia agar bisa:
1. Melihat list draft broadcast yang sudah dibuat oleh Content Maker Agent
2. Review dan approve draft per audience
3. Send broadcast ke audience menggunakan API WhatsApp unofficial (send satu persatu)

## 📋 Current Context

**Data Available:**
- `campaign_audience` table memiliki:
  - `campaign_id` (UUID)
  - `audience_id` (UUID)
  - `broadcast_content` (TEXT) - Content yang sudah dibuat
  - `source_contact_id` (TEXT) - Nomor WhatsApp
  - `full_name` (TEXT) - Nama audience
  - `meta.guardrails.tag` (TEXT) - 'approved' atau 'needs_review'
  - `target_status` (TEXT) - Status pengiriman

**Current Portal Structure:**
- `/broadcast` - Halaman untuk create campaign
- `/status` - Halaman untuk melihat status campaign
- Components: `CampaignForm`, `StatusDisplay`, `ImageUpload`

## 🏗️ Proposed Implementation

### Phase 1: Create Drafts Page

**File:** `app/drafts/page.tsx`

**Features:**
- List semua draft yang ready untuk review
- Filter by campaign
- Filter by guardrails status (approved/needs_review)
- Search by audience name
- Pagination

**Data Source:**
- Query `campaign_audience` table dengan:
  - `broadcast_content IS NOT NULL`
  - `target_status = 'pending'` atau belum dikirim
  - Join dengan `campaign` untuk campaign info
  - Join dengan `audience` untuk audience details

### Phase 2: Draft List Component

**File:** `components/drafts/draft-list.tsx`

**Features:**
- Display list draft dalam table/card format
- Show: Campaign name, Audience name, Content preview, Guardrails status, Character count
- Action buttons: Approve, Reject, Send, View Details
- Bulk actions: Select multiple, Approve all, Send all

**UI Elements:**
- Table dengan columns:
  - Checkbox (for bulk selection)
  - Campaign Name
  - Audience Name
  - Content Preview (truncated)
  - Guardrails Status (Badge)
  - Character Count
  - Actions (Approve, Send, View)

### Phase 3: Draft Detail Modal/Page

**File:** `components/drafts/draft-detail.tsx`

**Features:**
- Show full content
- Show audience details
- Show campaign objective
- Show guardrails violations (if any)
- Action buttons: Approve, Reject, Send, Edit (optional)

### Phase 4: API Endpoints

#### A. Get Drafts API

**File:** `app/api/drafts/route.ts`

**Method:** `GET`

**Query Parameters:**
- `campaign_id` (optional) - Filter by campaign
- `status` (optional) - Filter by guardrails status
- `page` (optional) - Pagination
- `limit` (optional) - Items per page

**Response:**
```json
{
  "drafts": [
    {
      "campaign_id": "uuid",
      "campaign_name": "Campaign Name",
      "audience_id": "uuid",
      "audience_name": "Full Name",
      "source_contact_id": "6281234567890",
      "broadcast_content": "Content text...",
      "character_count": 245,
      "guardrails_tag": "approved",
      "guardrails_status": "approved",
      "guardrails_violations": [],
      "target_status": "pending",
      "created_at": "2025-12-17T...",
      "updated_at": "2025-12-17T..."
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

#### B. Approve Draft API

**File:** `app/api/drafts/approve/route.ts`

**Method:** `POST`

**Body:**
```json
{
  "campaign_id": "uuid",
  "audience_id": "uuid",
  "approved": true  // or false for reject
}
```

**Action:**
- Update `campaign_audience.meta.guardrails.tag` to 'approved' or 'rejected'
- Update `campaign_audience.meta.guardrails.approved_at`
- Update `campaign_audience.meta.guardrails.approved_by` (user ID)

#### C. Send Broadcast API

**File:** `app/api/drafts/send/route.ts`

**Method:** `POST`

**Body (Single):**
```json
{
  "campaign_id": "uuid",
  "audience_id": "uuid"
}
```

**Body (Bulk):**
```json
{
  "items": [
    {
      "campaign_id": "uuid",
      "audience_id": "uuid"
    }
  ]
}
```

**Action:**
1. Get draft content dari `campaign_audience`
2. Get phone number dari `source_contact_id`
3. Send via WhatsApp unofficial API (one by one)
4. Update `campaign_audience.target_status` to 'sent' or 'failed'
5. Log send attempt dengan timestamp
6. Return success/error status

### Phase 5: WhatsApp Unofficial API Integration

**File:** `app/api/whatsapp/send/route.ts` (or internal function)

**Implementation Options:**

#### Option A: WhatsApp Web API (via library)
- Use library seperti `whatsapp-web.js` atau similar
- Requires WhatsApp Web session
- Can send messages directly

#### Option B: HTTP API to WhatsApp Service
- Call external WhatsApp API service
- Send POST request dengan phone number dan message
- Handle response and errors

**API Structure:**
```typescript
async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Implementation
  // 1. Format phone number (remove +, ensure country code)
  // 2. Call WhatsApp API
  // 3. Handle response
  // 4. Return result
}
```

**Error Handling:**
- Invalid phone number
- API rate limit
- Network errors
- WhatsApp service unavailable

### Phase 6: Update Database Schema (if needed)

**Potential Updates:**
- Add `approved_at` timestamp
- Add `approved_by` user ID
- Add `sent_at` timestamp
- Add `sent_status` (sent, failed, pending)
- Add `send_error` message

**SQL Migration:**
```sql
-- Update campaign_audience meta structure
-- Already has meta.guardrails, can add:
-- meta.approval: { approved_at, approved_by }
-- meta.send: { sent_at, sent_status, send_error }
```

## 🔄 User Flow

1. **Admin Login** → Navigate to `/drafts`
2. **View Drafts List** → See all pending drafts
3. **Filter/Search** → Find specific drafts
4. **Review Draft** → Click to view full content
5. **Approve/Reject** → Mark draft as approved or rejected
6. **Send Broadcast** → Send approved drafts to audience
7. **View Status** → See send status (sent, failed, pending)

## 📝 Implementation Details

### Database Queries

**Get Drafts:**
```sql
SELECT 
  ca.campaign_id,
  c.name as campaign_name,
  ca.audience_id,
  a.full_name as audience_name,
  a.source_contact_id,
  ca.broadcast_content,
  ca.character_count,
  ca.meta->'guardrails'->>'tag' as guardrails_tag,
  ca.meta->'guardrails'->>'status' as guardrails_status,
  ca.meta->'guardrails'->'violations' as guardrails_violations,
  ca.target_status,
  ca.created_at,
  ca.updated_at
FROM citia_mora_datamart.campaign_audience ca
JOIN citia_mora_datamart.campaign c ON ca.campaign_id = c.id
JOIN citia_mora_datamart.audience a ON ca.audience_id = a.id
WHERE ca.broadcast_content IS NOT NULL
  AND ca.broadcast_content != ''
  AND ca.target_status = 'pending'
ORDER BY ca.updated_at DESC
LIMIT 20 OFFSET 0;
```

**Approve Draft:**
```sql
UPDATE citia_mora_datamart.campaign_audience
SET meta = jsonb_set(
  jsonb_set(
    COALESCE(meta, '{}'::jsonb),
    '{guardrails}',
    jsonb_set(
      COALESCE(meta->'guardrails', '{}'::jsonb),
      '{tag}',
      '"approved"'::jsonb
    )
  ),
  '{approval}',
  jsonb_build_object(
    'approved_at', NOW(),
    'approved_by', '{{ user_id }}'
  )
)
WHERE campaign_id = '{{ campaign_id }}'
  AND audience_id = '{{ audience_id }}';
```

**Update Send Status:**
```sql
UPDATE citia_mora_datamart.campaign_audience
SET 
  target_status = 'sent',
  meta = jsonb_set(
    COALESCE(meta, '{}'::jsonb),
    '{send}',
    jsonb_build_object(
      'sent_at', NOW(),
      'sent_status', 'sent',
      'send_error', NULL
    )
  ),
  updated_at = NOW()
WHERE campaign_id = '{{ campaign_id }}'
  AND audience_id = '{{ audience_id }}';
```

### UI Components Structure

```
app/
  drafts/
    page.tsx              # Main drafts page
  api/
    drafts/
      route.ts            # GET drafts
      approve/
        route.ts          # POST approve/reject
      send/
        route.ts          # POST send broadcast
    whatsapp/
      send/
        route.ts          # POST send WhatsApp message

components/
  drafts/
    draft-list.tsx        # List component
    draft-detail.tsx      # Detail modal/page
    draft-card.tsx        # Individual draft card
    draft-filters.tsx     # Filter component
```

### State Management

**Draft List State:**
```typescript
interface Draft {
  campaign_id: string;
  campaign_name: string;
  audience_id: string;
  audience_name: string;
  source_contact_id: string;
  broadcast_content: string;
  character_count: number;
  guardrails_tag: 'approved' | 'needs_review' | 'rejected';
  guardrails_status: string;
  guardrails_violations: any[];
  target_status: 'pending' | 'sent' | 'failed';
  created_at: string;
  updated_at: string;
}

const [drafts, setDrafts] = useState<Draft[]>([]);
const [loading, setLoading] = useState(false);
const [selectedDrafts, setSelectedDrafts] = useState<string[]>([]);
const [filters, setFilters] = useState({
  campaign_id: null,
  status: null,
  search: ''
});
```

## 🔐 Security Considerations

1. **Authentication:**
   - Only authenticated admin users can access drafts
   - Check user role/permissions

2. **Authorization:**
   - Verify user has permission to approve/send
   - Log all approval and send actions

3. **Rate Limiting:**
   - Limit send requests per user/time
   - Prevent spam sending

4. **Input Validation:**
   - Validate campaign_id and audience_id
   - Sanitize phone numbers
   - Validate content before sending

## 📊 Monitoring & Logging

1. **Send Logs:**
   - Log setiap send attempt
   - Store success/failure status
   - Track send time and response

2. **Approval Logs:**
   - Log who approved/rejected
   - Track approval time
   - Store approval reason (optional)

3. **Error Tracking:**
   - Log API errors
   - Track failed sends
   - Monitor WhatsApp API availability

## 🚀 Implementation Order

1. **Phase 1:** Create drafts page and list component
   - Basic UI structure
   - Fetch and display drafts

2. **Phase 2:** Add filters and search
   - Filter by campaign
   - Filter by status
   - Search functionality

3. **Phase 3:** Implement approve/reject
   - Approve API endpoint
   - Update UI on approve

4. **Phase 4:** Implement send functionality
   - WhatsApp API integration
   - Send API endpoint
   - Update status after send

5. **Phase 5:** Add bulk actions
   - Select multiple drafts
   - Bulk approve
   - Bulk send

6. **Phase 6:** Polish and error handling
   - Error messages
   - Loading states
   - Success notifications

## ❓ Open Questions

1. **WhatsApp API:**
   - Which WhatsApp unofficial API service to use?
   - How to handle authentication?
   - Rate limits and pricing?

2. **Bulk Send:**
   - How many can be sent at once?
   - Should there be a delay between sends?
   - How to handle partial failures?

3. **Approval Workflow:**
   - Can drafts be edited before sending?
   - Should there be multiple approval levels?
   - Can rejected drafts be resubmitted?

4. **Notifications:**
   - Should admin get notified of new drafts?
   - Should there be email notifications?
   - Real-time updates via Supabase realtime?

## 📚 References

- [Supabase Client Documentation](https://supabase.com/docs/reference/javascript/introduction)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [WhatsApp Web.js](https://github.com/pedroslopez/whatsapp-web.js) (if using)

## ✅ Next Steps

1. **Clarify WhatsApp API:**
   - Confirm which WhatsApp service to use
   - Get API credentials and documentation
   - Test API with sample message

2. **Design UI:**
   - Create mockup for drafts page
   - Design draft card/table layout
   - Plan user interactions

3. **Implement:**
   - Start with Phase 1 (drafts page)
   - Test incrementally
   - Iterate based on feedback
