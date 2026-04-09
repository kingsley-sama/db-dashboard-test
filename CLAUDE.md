# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server (Next.js 15 + Turbopack)
npm run build        # Production build
npm run start        # Run production server

# Database
npm run db:setup     # Interactive setup — generates .env, docker-compose.yml
npm run db:generate  # Generate Drizzle migrations from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:seed      # Seed initial data
npm run db:studio    # Open Drizzle Studio (database GUI)
```

No lint or test scripts are configured.

## Architecture

Full-stack SaaS starter built with **Next.js 15 App Router**, **PostgreSQL** (via Supabase), and **Drizzle ORM**.

### Route Groups

- `app/(login)/` — Unauthenticated pages (sign-in, sign-up). Guest-only.
- `app/(dashboard)/` — Protected routes. Requires valid session. Contains user settings, team management, activity logs, and orders.
- `app/api/` — REST API endpoints (orders, products, user, team).
- `app/my-app/` — Server actions.

### Auth & Sessions

Custom JWT-based auth — no NextAuth or third-party provider.

1. Password hashed with bcryptjs (10 rounds).
2. JWT signed with `AUTH_SECRET` (HS256), valid 24 hours, stored in an HTTP-only `session` cookie.
3. `middleware.ts` validates the cookie on every request and refreshes it. Redirects to `/sign-in` if expired.
4. Server actions use wrappers in `lib/auth/middleware.ts` to extract the validated user before any mutation.

Key files: `lib/auth/session.ts`, `middleware.ts`, `lib/auth/middleware.ts`.

### Database

Schema lives in `lib/db/schema.ts`. Core tables: `users`, `teams`, `teamMembers`, `invitations`, `activityLogs`.

- Queries are in `lib/db/queries.ts`.
- Supabase is used as the managed PostgreSQL host.
- The Drizzle client is initialized in `lib/db/drizzle.ts` from `POSTGRES_URL`.
- API routes use the Supabase admin client (`lib/supabase/`) for direct table access alongside Drizzle.

### Data Fetching Pattern

- Server components fetch data directly and pass it as SWR fallback via the root `SWRConfig` in `app/layout.tsx`.
- Client components use `useSWR` hooks for live data and revalidation.
- Form submissions go through Next.js Server Actions with Zod validation.

### Key Libraries

| Purpose | Library |
|---|---|
| UI components | shadcn/ui + Radix UI |
| Forms | React Hook Form + Zod |
| Client data | SWR |
| File uploads | Uppy + Supabase Storage |
| Charts | Recharts |
| Canvas | Konva / react-konva |
| Toasts | Sonner |
| Auth tokens | jose |

## Environment Variables

```
POSTGRES_URL=
BASE_URL=
AUTH_SECRET=                        # 64+ char hex string
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Run `npm run db:setup` to auto-generate `.env` and `docker-compose.yml`.

## TypeScript Path Alias

`@/*` maps to the repo root — use it for all internal imports.
