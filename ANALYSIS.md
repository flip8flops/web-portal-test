# Web Portal Test - Analysis & Understanding

**Date:** 2025-12-10  
**Purpose:** Analisis project web-portal-test sebagai base untuk Citia Portal UI

## 📋 Project Overview

**Nama Project:** Metagapura Portal  
**Tipe:** Web Portal untuk personal note-taking dengan AI-powered summarization  
**Status:** Test case di luar context Citia, tapi struktur sudah siap untuk di-extend ke Citia agents

## 🏗️ Tech Stack

### Frontend:
- **Next.js 14** - React framework dengan App Router
- **TypeScript 5.9** - Type-safe development
- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - High-quality component library
- **Lucide React** - Icon library

### Backend & Database:
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database dengan Row-Level Security (RLS)
  - Authentication service (Magic Link)
  - Real-time capabilities

### Automation & AI:
- **n8n** - Workflow automation platform
  - Webhook-based integration
  - Basic Auth untuk security
  - LLM integration untuk note summarization

## 📁 Struktur Project

```
web-portal-test/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── health/        # Health check endpoint
│   │   └── notes/
│   │       └── summary/   # AI summary generation endpoint ⭐
│   ├── login/             # Login page (Magic Link)
│   ├── logout/            # Logout page
│   ├── notes/             # Notes management page
│   ├── status/             # Status page
│   └── page.tsx            # Dashboard
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   ├── navbar.tsx         # Top navigation
│   └── sidebar.tsx        # Side navigation
├── src/lib/
│   └── supabase/
│       ├── client.ts      # Client-side Supabase client
│       └── server.ts      # Server-side auth helper
└── lib/
    └── utils.ts           # Utility functions
```

## 🔌 Koneksi ke n8n (Existing)

### Current Implementation:
**API Route:** `/app/api/notes/summary/route.ts`

**Flow:**
1. User klik "Generate Summary" di Notes page
2. Frontend call `/api/notes/summary` dengan Bearer token
3. API route:
   - Validates user session
   - Checks rate limit (daily limit: 2 summaries)
   - Calls n8n webhook dengan Basic Auth
   - Webhook URL: `N8N_NOTES_WEBHOOK_URL?user_id={userId}`
   - Stores summary in `test.note_summaries` table
4. Returns summary to frontend

**Environment Variables:**
```env
N8N_NOTES_WEBHOOK_URL=https://your-n8n-instance.com/webhook/notes-summary
N8N_NOTES_WEBHOOK_USER=your-webhook-username
N8N_NOTES_WEBHOOK_PASS=your-webhook-password
```

**Security:**
- Basic Auth untuk webhook calls
- Server-side only (credentials tidak exposed ke client)
- Rate limiting (daily limit)

## 🎯 Fitur yang Sudah Ada

### 1. Authentication
- ✅ Magic Link authentication via Supabase
- ✅ Session management (client & server-side)
- ✅ Protected routes

### 2. Notes Management
- ✅ Create notes (max 280 characters)
- ✅ View notes list
- ✅ Real-time updates via Supabase

### 3. AI Summarization
- ✅ Generate AI summary via n8n webhook
- ✅ Rate limiting (2 summaries per day)
- ✅ Store summary in database
- ✅ Display summary in UI

### 4. UI Components
- ✅ Dashboard dengan stats
- ✅ Notes page dengan form
- ✅ Modern UI dengan gradients
- ✅ Responsive design

## 🔗 Potensi Koneksi ke Citia Agents

### Pattern yang Sudah Ada:
1. **n8n Webhook Integration Pattern:**
   - API route untuk call webhook
   - Basic Auth untuk security
   - Error handling
   - Rate limiting

2. **Supabase Integration:**
   - Client-side & server-side clients
   - RLS policies
   - Schema-based queries

3. **UI Components:**
   - Form components
   - Card components
   - Alert components
   - Navigation structure

### Yang Bisa Di-Extend untuk Citia:

#### 1. Campaign Management Page
**Pattern:** Similar to Notes page
- Form untuk create campaign (notes + image)
- List of campaigns
- Status tracking
- Integration dengan Research Agent webhook

**API Route:** `/app/api/campaigns/create/route.ts`
- Call n8n webhook: `Agent Broadcast Team` workflow
- Webhook ID: `5a684c54-cabc-41d3-b375-7cc24c4912a6`
- Payload: `{ notes, image }` (multipart/form-data)

#### 2. Campaign Status Page
**Pattern:** Similar to Dashboard
- List campaigns dengan status
- Filter by status (draft, matchmaker_completed, etc.)
- View campaign details
- View matched audience

**Data Source:** `citia_mora_datamart.campaign` table

#### 3. Audience Management Page
**Pattern:** Similar to Notes page
- View matched audience per campaign
- Filter by channel, status
- View matchmaker reasons

**Data Source:** `citia_mora_datamart.campaign_audience` table

## 🗄️ Database Schema (Current)

### Schema: `test`
- `notes` - User notes (max 280 chars)
- `note_summaries` - AI summaries dengan rate limiting

### Schema: `citia_mora_datamart` (Future)
- `campaign` - Campaign data
- `audience` - Audience data
- `campaign_audience` - Matched audience
- `asset` - Campaign assets
- `campaign_asset` - Campaign-asset junction

## 🔄 Integration Points dengan Citia Agents

### 1. Research Agent Integration
**Current Pattern:** Notes summary webhook
**Citia Pattern:** Campaign creation webhook

**API Route:** `/app/api/campaigns/create/route.ts`
```typescript
// Similar to /api/notes/summary but for campaigns
- Accept: notes (text) + image (file)
- Call: n8n webhook (Agent Broadcast Team)
- Webhook: POST with multipart/form-data
- Response: campaign_id, status
```

### 2. Matchmaker Agent Integration
**Current Pattern:** Read from database
**Citia Pattern:** Read matched audience from database

**API Route:** `/app/api/campaigns/[id]/audience/route.ts`
```typescript
// Query citia_mora_datamart.campaign_audience
- Filter by campaign_id
- Return matched audience list
```

### 3. Campaign Status Tracking
**Current Pattern:** Real-time updates via Supabase
**Citia Pattern:** Real-time campaign status updates

**Implementation:**
- Supabase real-time subscription ke `campaign` table
- Update UI ketika status berubah (draft → matchmaker_completed)

## 📊 Current Features vs Citia Needs

### ✅ Sudah Ada (Bisa Reuse):
1. **Authentication** - Magic Link via Supabase ✅
2. **n8n Webhook Integration Pattern** - Basic Auth, error handling ✅
3. **UI Components** - Form, Card, Alert, Navigation ✅
4. **Database Integration** - Supabase client, RLS ✅
5. **Rate Limiting Pattern** - Daily limit logic ✅

### 🔄 Perlu Di-Extend:
1. **Campaign Management** - Create, view, list campaigns
2. **Image Upload** - Upload campaign images (similar to notes, but binary)
3. **Campaign Status** - Track status dari draft → matchmaker_completed
4. **Audience View** - View matched audience per campaign
5. **Rejection Handling** - Handle Guardrails rejection

### ❌ Belum Ada (Perlu Dibuat):
1. **Campaign Form** - Form untuk create campaign (notes + image)
2. **Campaign List** - List semua campaigns dengan filter
3. **Campaign Detail** - View campaign details + matched audience
4. **Status Badge** - Visual indicator untuk campaign status
5. **Guardrails Feedback** - Display rejection reason jika input ditolak

## 🎨 UI Structure (Current)

### Navigation:
- **Dashboard** (`/`) - Overview dengan stats
- **Notes** (`/notes`) - Notes management + AI summary

### Navigation (Future - Citia):
- **Dashboard** (`/`) - Campaign overview
- **Campaigns** (`/campaigns`) - Campaign management
- **Create Campaign** (`/campaigns/create`) - Create new campaign
- **Campaign Detail** (`/campaigns/[id]`) - View campaign + audience
- **Audience** (`/audience`) - Audience management

## 🔐 Security Features (Current)

1. **Row-Level Security (RLS)** - Database-level isolation
2. **Server-Side Authentication** - API routes validate sessions
3. **Environment Variables** - Credentials server-side only
4. **Rate Limiting** - Daily limits untuk AI features
5. **Basic Auth** - Secure webhook communication

## 💡 Key Insights

### 1. **Webhook Pattern Sudah Established**
- Pattern untuk call n8n webhook sudah ada
- Basic Auth sudah implemented
- Error handling sudah ada
- Bisa langsung reuse untuk Citia agents

### 2. **Database Integration Ready**
- Supabase client sudah setup
- RLS policies pattern sudah ada
- Schema-based queries sudah digunakan
- Bisa langsung query `citia_mora_datamart` schema

### 3. **UI Components Reusable**
- shadcn/ui components sudah ada
- Form components ready
- Card components ready
- Navigation structure ready

### 4. **Missing: Citia-Specific Features**
- Campaign creation form
- Campaign list & detail pages
- Audience visualization
- Status tracking UI
- Guardrails rejection feedback

## 🚀 Next Steps untuk Citia Integration

### Phase 1: Campaign Creation
1. Create `/app/campaigns/create/page.tsx`
2. Create `/app/api/campaigns/create/route.ts`
3. Connect ke Agent Broadcast Team webhook
4. Handle Guardrails rejection

### Phase 2: Campaign Management
1. Create `/app/campaigns/page.tsx` (list)
2. Create `/app/campaigns/[id]/page.tsx` (detail)
3. Query `citia_mora_datamart.campaign` table
4. Display campaign status

### Phase 3: Audience View
1. Create `/app/campaigns/[id]/audience/page.tsx`
2. Query `citia_mora_datamart.campaign_audience` table
3. Display matched audience dengan filters
4. Show matchmaker reasons

### Phase 4: Real-time Updates
1. Supabase real-time subscription
2. Update UI ketika campaign status berubah
3. Notification untuk status changes

## 📝 Environment Variables (Future)

```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Existing n8n (Notes)
N8N_NOTES_WEBHOOK_URL=...
N8N_NOTES_WEBHOOK_USER=...
N8N_NOTES_WEBHOOK_PASS=...

# New: Citia Agents
N8N_CITIA_CAMPAIGN_WEBHOOK_URL=https://ot2.metagapura.com/webhook/5a684c54-cabc-41d3-b375-7cc24c4912a6
N8N_CITIA_CAMPAIGN_WEBHOOK_USER=...
N8N_CITIA_CAMPAIGN_WEBHOOK_PASS=...
```

## ✅ Summary

**Project ini adalah base yang solid untuk Citia Portal UI karena:**

1. ✅ **n8n Integration Pattern** - Sudah established, bisa langsung reuse
2. ✅ **Supabase Integration** - Client & server-side sudah setup
3. ✅ **UI Components** - Modern, reusable components
4. ✅ **Security** - RLS, authentication, rate limiting sudah ada
5. ✅ **Architecture** - Clean separation, scalable structure

**Yang perlu ditambahkan:**
- Campaign management pages
- Integration dengan Agent Broadcast Team webhook
- Query ke `citia_mora_datamart` schema
- UI untuk campaign status & audience visualization

**Pattern yang bisa langsung digunakan:**
- Webhook call pattern dari `/api/notes/summary`
- Form submission pattern dari Notes page
- Database query pattern dari Notes page
- Error handling & rate limiting pattern

