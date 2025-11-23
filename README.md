# Metagapura Portal

A modern, secure web portal built with Next.js 14 that provides personal note-taking with AI-powered summarization. Features include Supabase authentication, Row-Level Security (RLS) for data isolation, and integration with n8n workflows for intelligent note analysis.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-2.80-green?style=flat-square&logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38bdf8?style=flat-square&logo=tailwind-css)

## 📸 Screenshots

### Dashboard Overview

The dashboard provides a comprehensive overview of your portal with real-time statistics and quick access to key features.

<img width="2400" height="1417" alt="Dashboard Overview" src="https://github.com/user-attachments/assets/427fab2f-ff48-4d2b-a255-cd8f8ec41de6" />

### Notes Management with AI Summarization

The notes page allows you to create, manage, and view your personal notes. The AI-powered summary feature analyzes all your notes and generates intelligent insights.

<img width="1871" height="1297" alt="Notes Management with AI Summarization" src="https://github.com/user-attachments/assets/3bce0a3f-a69b-4787-8528-815513703778" />

## 🌟 Features

- **🔐 Secure Authentication**: Magic link authentication via Supabase Auth
- **📝 Personal Notes**: Create and manage personal notes with a 280-character limit
- **🤖 AI Summarization**: Generate intelligent summaries of your notes using AI (via n8n workflows)
- **🔒 Row-Level Security**: Database-level security ensuring users can only access their own data
- **🎨 Modern UI**: Beautiful, responsive interface built with shadcn/ui and Tailwind CSS
- **📊 Dashboard**: Overview dashboard with real-time statistics
- **⚡ Rate Limiting**: Prevents abuse with configurable daily limit (default: 2 summaries per day)

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- [Next.js 14](https://nextjs.org/) - React framework with App Router
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development
- [Tailwind CSS v4](https://tailwindcss.com/) - Utility-first CSS framework
- [shadcn/ui](https://ui.shadcn.com/) - High-quality component library
- [Lucide React](https://lucide.dev/) - Beautiful icon library

**Backend & Database:**
- [Supabase](https://supabase.com/) - Backend-as-a-Service
  - PostgreSQL database with Row-Level Security (RLS)
  - Authentication service
  - Real-time capabilities

**Automation & AI:**
- [n8n](https://n8n.io/) - Workflow automation platform
  - Webhook-based integration
  - LLM integration for note summarization
  - Secure Basic Auth for webhook calls

### System Architecture

```
┌─────────────┐
│   Browser   │
│  (Next.js)  │
└──────┬──────┘
       │
       ├──► Supabase Auth (Magic Links)
       │
       ├──► Supabase Database (PostgreSQL + RLS)
       │    └──► test.notes (user notes)
       │    └──► test.note_summaries (AI summaries)
       │
       └──► API Route (/api/notes/summary)
            │
            └──► n8n Webhook
                 │
                 ├──► Fetches user notes from Supabase
                 ├──► Processes through LLM
                 └──► Returns AI-generated summary
```

### Security Features

- **Row-Level Security (RLS)**: Database policies ensure users can only access their own notes
- **Server-Side Authentication**: API routes validate user sessions before processing requests
- **Environment Variables**: Sensitive credentials stored securely, never exposed to client
- **Rate Limiting**: Prevents abuse of AI summarization service with daily generation limits (default: 2 per day)
- **Basic Auth**: Secure webhook communication with n8n using Basic Authentication

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm or yarn
- Supabase account and project
- n8n instance (for AI summarization feature)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/web-portal-test.git
   cd web-portal-test
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Set up environment variables**

   Create a `.env.local` file in the root directory:

   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # n8n Webhook Configuration (required for AI summarization)
   N8N_NOTES_WEBHOOK_URL=https://your-n8n-instance.com/webhook/notes-summary
   N8N_NOTES_WEBHOOK_USER=your-webhook-username
   N8N_NOTES_WEBHOOK_PASS=your-webhook-password

   # App Configuration
   NEXT_PUBLIC_APP_NAME=Metagapura Portal
   ```

4. **Configure Supabase**

   Run the following SQL in your Supabase SQL Editor:

   - Create schema and grant permissions:
     ```sql
     CREATE SCHEMA IF NOT EXISTS test;
     
     GRANT USAGE ON SCHEMA test TO authenticated;
     GRANT USAGE ON SCHEMA test TO anon;
     ```

   - Create `notes` table with RLS enabled:
     ```sql
     CREATE TABLE test.notes (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
       content TEXT NOT NULL CHECK (char_length(content) <= 280),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );

     ALTER TABLE test.notes ENABLE ROW LEVEL SECURITY;

     CREATE POLICY "Users can view own notes"
       ON test.notes FOR SELECT
       USING (auth.uid() = user_id);

     CREATE POLICY "Users can insert own notes"
       ON test.notes FOR INSERT
       WITH CHECK (auth.uid() = user_id);
     ```

   - Create a trigger to auto-set `user_id`:
     ```sql
     CREATE OR REPLACE FUNCTION test.set_user_id()
     RETURNS TRIGGER AS $$
     BEGIN
       NEW.user_id := auth.uid();
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql SECURITY DEFINER;

     CREATE TRIGGER set_user_id_trigger
       BEFORE INSERT ON test.notes
       FOR EACH ROW
       EXECUTE FUNCTION test.set_user_id();
     ```

   - Create `note_summaries` table for AI summaries with rate limiting:
     ```sql
     CREATE TABLE test.note_summaries (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
       summary TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_generated_at TIMESTAMPTZ,
       generation_count INTEGER DEFAULT 0,
       max_generations_per_day INTEGER DEFAULT 2,
       UNIQUE(user_id)
     );

     -- Enable Row Level Security
     ALTER TABLE test.note_summaries ENABLE ROW LEVEL SECURITY;

     -- Create RLS policies
     CREATE POLICY "Users can view own summaries"
       ON test.note_summaries FOR SELECT
       USING (auth.uid() = user_id);

     CREATE POLICY "Users can insert own summaries"
       ON test.note_summaries FOR INSERT
       WITH CHECK (auth.uid() = user_id);

     CREATE POLICY "Users can update own summaries"
       ON test.note_summaries FOR UPDATE
       USING (auth.uid() = user_id);
     ```

     **Note**: The `max_generations_per_day` field (default 2) can be adjusted in the database to change the daily limit for testing. Only you (the admin) should modify this value.

   - Configure redirect URLs in Supabase Dashboard:
     - Go to **Authentication > URL Configuration**
     - Add redirect URLs: `http://localhost:3000/notes` (development) and your production URL

5. **Run the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Building for Production

```bash
npm run build
npm start
```

The app uses Next.js standalone output for optimized Docker deployments.

## 🐳 Docker

Build and run with Docker:

```bash
docker build -t metagapura-portal:latest .
docker run --rm -p 3000:3000 metagapura-portal:latest
```

## 🔌 n8n Integration

The portal integrates with n8n workflows for AI-powered note summarization. The n8n workflow:

1. Receives a `user_id` parameter via webhook
2. Fetches all notes for that user from Supabase
3. Processes notes through an LLM (configured in n8n)
4. Returns a plain text summary

**Rate Limiting**: To prevent abuse, users can generate a maximum number of summaries per day (default: 2). The system tracks daily generation counts and automatically resets the count each day. The limit can be adjusted in the database by modifying the `max_generations_per_day` field (admin only).

## 🛠️ Development

### Adding shadcn/ui Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for UI components:

```bash
npx shadcn@latest add [component-name]
```

Components are added to `components/ui/` and can be imported using the `@/components/ui` alias.

### Project Structure

```
web-portal-test/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   └── notes/
│   │       └── summary/   # Summary generation endpoint
│   ├── login/             # Login page
│   ├── notes/              # Notes page
│   └── page.tsx            # Dashboard
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   ├── navbar.tsx         # Top navigation
│   └── sidebar.tsx         # Side navigation
├── src/
│   └── lib/
│       └── supabase/
│           ├── client.ts   # Client-side Supabase client
│           └── server.ts   # Server-side auth helper
└── public/                # Static assets
```

## 🔒 Security Considerations

- All API routes validate user authentication server-side
- Database queries use RLS policies for data isolation
- Environment variables are never exposed to the client
- Webhook credentials are stored server-side only
- Rate limiting prevents service abuse

## 📝 License

This project is licensed under the UNLICENSED license.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using Next.js, Supabase, and n8n
