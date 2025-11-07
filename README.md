# Metagapura Portal

Minimal Next.js 14 (App Router) portal with TypeScript, Tailwind, ESLint/Prettier, and Docker (standalone).

## Requirements
- Node 20.x
- npm

## Getting Started (Local)

1. Install dependencies:
   
   ```bash
   npm ci
   ```

2. Set up environment variables:
   
   Copy `.env.local.example` to `.env.local`:
   
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and fill in your Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (from Supabase dashboard)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key (from Supabase dashboard)
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (from Supabase dashboard)

3. Run dev server:
   
   ```bash
   npm run dev
   ```

4. Build and start:
   
   ```bash
   npm run build
   npm start
   ```

- App: http://localhost:3000
- Health: http://localhost:3000/api/health

## Docker

Build image:

```bash
docker build -t web-portal-test:latest .
```

Run container:

```bash
docker run --rm -p 3000:3000 web-portal-test:latest
```

The image exposes port 3000 and includes a HEALTHCHECK hitting `/api/health`.

## CI

GitHub Actions workflow runs lint and build on PRs and pushes to `main`.

## Adding shadcn/ui Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for UI components. To add new components:

```bash
npx shadcn@latest add [component-name]
```

For example:
```bash
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
```

Components will be added to `components/ui/` and can be imported using the `@/components/ui` alias.

## Production Deployment (Coolify)

**Important:** For Next.js `NEXT_PUBLIC_*` environment variables to work, they must be set in Coolify **BEFORE** the build runs.

1. In Coolify, go to your application settings
2. Add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`
   - `NEXT_PUBLIC_APP_NAME` = `Metagapura Portal` (optional)
3. **Save the environment variables**
4. **Trigger a rebuild** - The Dockerfile uses ARG to pass these as build arguments

The Dockerfile is configured to accept these as build arguments, which Coolify should automatically pass during the build process.

## Notes
- Next.js standalone output is enabled in `next.config.mjs`.
- Strict TypeScript is enabled.
- Supabase authentication and RLS-protected notes are implemented.
- Environment variables must be set in Coolify before building (they're embedded at build time).


