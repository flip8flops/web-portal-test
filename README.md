# Citia Web Portal

Web portal untuk mengelola broadcast campaign Citia dengan AI Agent Tia. Portal ini terhubung dengan n8n workflow untuk generate, review, dan mengirim broadcast personalized ke audience.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-2.80-green?style=flat-square&logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38bdf8?style=flat-square&logo=tailwind-css)

## 🎯 Features

### Broadcast Management
- **Campaign Creation** - Input campaign notes dan image untuk di-process oleh AI agents
- **Real-time Status** - Tracking progress setiap agent (Guardrails, Research, Matchmaker, Content Maker)
- **Draft Review** - Review dan edit draft content sebelum dikirim
- **Approve/Reject** - Approve selected audiences atau reject all drafts
- **Send Broadcast** - Send broadcast ke WhatsApp (via unofficial API)

### Architecture: Independent Tabs
- **Input Tab** - Create campaign, lihat status agent
- **Output Tab** - Review draft, approve/reject, send

Kedua tab bersifat **independen** - tidak ada state locking antar tab.

---

## 📁 Project Structure

```
web-portal-test/
├── app/
│   ├── api/
│   │   ├── broadcast/create/     # Create campaign endpoint
│   │   └── drafts/               # Draft management endpoints
│   │       ├── route.ts          # GET drafts
│   │       ├── approve/          # Approve drafts
│   │       ├── reject/           # Reject campaign
│   │       ├── send/             # Send broadcasts
│   │       └── update-content/   # Edit content
│   ├── broadcast/                # Main broadcast page
│   ├── login/                    # Auth page
│   └── ...
├── components/
│   ├── broadcast/                # Broadcast components
│   │   ├── status-display.tsx    # Agent status display
│   │   ├── campaign-form.tsx     # Campaign input form
│   │   └── image-upload.tsx      # Image upload
│   ├── drafts/
│   │   └── draft-output.tsx      # Draft review component
│   └── ui/                       # shadcn/ui components
├── docs/
│   ├── architecture-refactor-plan.md
│   ├── supabase-schema-configuration.md
│   └── archive/                  # Old debugging docs
├── supabase/migrations/          # Database migrations
└── src/lib/supabase/             # Supabase client
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Supabase project dengan schema `citia_mora_datamart`
- n8n instance dengan Agent Broadcast Team workflow

### Installation

```bash
git clone https://github.com/flip8flops/web-portal-test.git
cd web-portal-test
npm install
cp .env.example .env.local
# Edit .env.local dengan credentials
npm run dev
```

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# n8n Webhook
N8N_CITIA_CAMPAIGN_WEBHOOK_URL=https://xxx/webhook/xxx
N8N_CITIA_CAMPAIGN_WEBHOOK_USER=xxx
N8N_CITIA_CAMPAIGN_WEBHOOK_PASS=xxx
```

---

## 🗄️ Database Schema

Schema: `citia_mora_datamart`

| Table | Description |
|-------|-------------|
| `campaign` | Campaign data dengan status |
| `audience` | Audience data |
| `campaign_audience` | Matched audience + broadcast_content |
| `campaign_status_updates` | Real-time status dari agents |

### Campaign Status Flow
```
content_drafted → approved → sent
              ↘ rejected
```

---

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/broadcast/create` | POST | Create new campaign |
| `/api/drafts` | GET | Get most recent content_drafted campaign |
| `/api/drafts/approve` | POST | Approve selected audiences |
| `/api/drafts/reject` | POST | Reject campaign |
| `/api/drafts/send` | POST | Send to approved audiences |
| `/api/drafts/update-content` | POST | Edit draft content |

---

## 🐳 Docker / Coolify

Project ini auto-deploy via Coolify ketika push ke GitHub.

```bash
docker build -t citia-portal:latest .
docker run --rm -p 3000:3000 citia-portal:latest
```

---

## 📄 License

UNLICENSED

---

Built for Citia by MORA team
