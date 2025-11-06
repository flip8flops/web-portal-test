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

2. (Optional) set environment name:
   
   Create `.env.local` if desired:
   
   ```bash
   echo NEXT_PUBLIC_APP_NAME="Metagapura Portal" > .env.local
   ```

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

## Notes
- Next.js standalone output is enabled in `next.config.mjs`.
- Strict TypeScript is enabled.


