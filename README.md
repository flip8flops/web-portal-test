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

## Notes
- Next.js standalone output is enabled in `next.config.mjs`.
- Strict TypeScript is enabled.
- Supabase authentication and RLS-protected notes are implemented.
- Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are configured in production via Coolify.


