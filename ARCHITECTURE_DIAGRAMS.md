# Integration Architecture Diagram

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      NEXT.JS APPLICATION                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              MIDDLEWARE (middleware.ts)               │     │
│  │  - Protects: ['/dashboard', '/my-app']              │     │
│  │  - Checks: Session Cookie                           │     │
│  │  - Redirects to: /sign-in if no session            │     │
│  └──────────────────────────────────────────────────────┘     │
│                           │                                     │
│              ┌────────────┴──────────────┐                     │
│              ↓                            ↓                     │
│  ┌──────────────────┐          ┌──────────────────┐           │
│  │   MAIN APP       │          │     MY-APP       │           │
│  │   /dashboard     │          │     /my-app      │           │
│  ├──────────────────┤          ├──────────────────┤           │
│  │ • User Dashboard │          │ • Projects Page  │           │
│  │ • Settings       │          │ • Annotation     │           │
│  │                  │          │ • Upload         │           │
│  └──────────────────┘          └──────────────────┘           │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │
       │ 1. Visits /my-app
       ↓
┌─────────────────────────────────────┐
│  Middleware (middleware.ts)          │
│  • Check session cookie              │
│  • Is /my-app protected? ✓ Yes      │
└───────┬─────────────────────────────┘
        │
        │ Session exists?
        │
   ┌────┴─────┐
   │          │
   NO        YES
   │          │
   ↓          ↓
┌──────────────┐    ┌────────────────┐
│ Redirect to  │    │ Allow access   │
│  /sign-in    │    │ to /my-app     │
└──────────────┘    └────────────────┘
   │                        │
   │ 2. User logs in       │ 3. User interacts
   ↓                        ↓
┌──────────────┐    ┌────────────────┐
│ JWT Session  │    │ Server Action  │
│ Cookie Set   │    │ (e.g., create) │
└──────────────┘    └────────┬───────┘
   │                         │
   │ 3. Redirect back        │ 4. Check auth
   ↓                         ↓
┌──────────────┐    ┌────────────────┐
│  /my-app     │    │ requireAuth()  │
└──────────────┘    └────────┬───────┘
                             │
                             │ Session exists?
                        ┌────┴─────┐
                        │          │
                       NO         YES
                        │          │
                        ↓          ↓
                 ┌──────────┐  ┌──────────┐
                 │ Redirect │  │ Execute  │
                 │ /sign-in │  │  Action  │
                 └──────────┘  └──────────┘
```

## Theme Inheritance

```
┌───────────────────────────────────────────────┐
│         /app/globals.css                      │
│  ┌─────────────────────────────────────────┐ │
│  │  CSS Variables                          │ │
│  │  --primary: hsl(...)                   │ │
│  │  --foreground: hsl(...)                │ │
│  │  --background: hsl(...)                │ │
│  └─────────────────────────────────────────┘ │
└──────────────┬────────────────────────────────┘
               │
               │ Imported by
               │
    ┌──────────┴──────────┐
    │                     │
    ↓                     ↓
┌────────────────┐  ┌────────────────┐
│  /app/         │  │ /my-app/app/   │
│  layout.tsx    │  │ layout.tsx     │
├────────────────┤  ├────────────────┤
│ <html>         │  │ Fragment       │
│  <body>        │  │ {children}     │
│   {children}   │  └────────────────┘
│  </body>       │         │
│ </html>        │         │
└────────────────┘         │
        │                  │
        └──────────┬───────┘
                   │
                   ↓
         ┌─────────────────┐
         │  All Components │
         │  Use Variables  │
         │  • bg-primary   │
         │  • text-foreground│
         └─────────────────┘
```

## File Organization

```
saas-starter-main/
│
├── app/
│   ├── globals.css ────────────────┐
│   ├── layout.tsx                  │ Provides theme
│   │   └── <html><body>            │ and structure
│   │       └── {children} ──────┐  │
│   │                             │  │
│   ├── (login)/                  │  │
│   │   └── sign-in/              │  │
│   │       └── page.tsx          │  │
│   │                             │  │
│   └── (dashboard)/              │  │
│       └── page.tsx              │  │
│                                 │  │
├── my-app/                       │  │
│   ├── app/                      │  │
│   │   ├── layout.tsx ───────────┼──┘
│   │   │   └── imports ──────────┘
│   │   ├── page.tsx
│   │   ├── project/[id]/
│   │   ├── upload/
│   │   └── actions/
│   │       ├── projects.ts ──┐
│   │       ├── threads.ts    │ All require
│   │       └── storage.ts ───┘ authentication
│   │
│   ├── lib/
│   │   └── auth.ts ──────────────┐
│   │                              │ Provides
│   └── components/               │ auth helpers
│       └── sidebar.tsx ──────────┘
│
├── lib/
│   ├── config.ts ────────────────┐
│   │                              │ App-wide
│   └── auth/                     │ configuration
│       └── session.ts ───────────┘
│
└── middleware.ts
    └── protectedRoutes: [
          '/dashboard',
          '/my-app'  ← Added
        ]
```

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT SIDE                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  User Action (e.g., Create Project)                    │
│         │                                               │
│         ↓                                               │
│  ┌──────────────────┐                                  │
│  │ Client Component │                                  │
│  │  • Button click  │                                  │
│  │  • Form submit   │                                  │
│  └────────┬─────────┘                                  │
│           │                                             │
│           │ Calls server action                        │
│           │                                             │
└───────────┼─────────────────────────────────────────────┘
            │
            │ HTTP Request
            │ (includes session cookie)
            │
┌───────────┼─────────────────────────────────────────────┐
│           ↓              SERVER SIDE                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐                                  │
│  │  Server Action   │                                  │
│  │  'use server'    │                                  │
│  └────────┬─────────┘                                  │
│           │                                             │
│           │ 1. await requireAuth()                     │
│           ↓                                             │
│  ┌──────────────────┐                                  │
│  │   Auth Check     │                                  │
│  │  • Read cookie   │                                  │
│  │  • Verify JWT    │                                  │
│  │  • Get user ID   │                                  │
│  └────────┬─────────┘                                  │
│           │                                             │
│      Auth OK?                                          │
│           │                                             │
│      ┌────┴─────┐                                      │
│     YES        NO                                       │
│      │          │                                       │
│      │          └──→ redirect('/sign-in')              │
│      │                                                  │
│      │ 2. Execute business logic                       │
│      ↓                                                  │
│  ┌──────────────────┐                                  │
│  │   Supabase DB    │                                  │
│  │  • Insert data   │                                  │
│  │  • Query data    │                                  │
│  │  • Update data   │                                  │
│  └────────┬─────────┘                                  │
│           │                                             │
│           │ 3. Return result                           │
│           ↓                                             │
│  ┌──────────────────┐                                  │
│  │   Response       │                                  │
│  └────────┬─────────┘                                  │
│           │                                             │
└───────────┼─────────────────────────────────────────────┘
            │
            │ HTTP Response
            │
┌───────────┼─────────────────────────────────────────────┐
│           ↓              CLIENT SIDE                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐                                  │
│  │   UI Update      │                                  │
│  │  • Show success  │                                  │
│  │  • Refresh data  │                                  │
│  │  • Update state  │                                  │
│  └──────────────────┘                                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Session Management

```
┌──────────────────────────────────────────────────────┐
│                 SESSION LIFECYCLE                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Login                                               │
│    ↓                                                 │
│  ┌────────────────────────────────┐                 │
│  │ /sign-in                       │                 │
│  │ • User enters credentials      │                 │
│  │ • Verify with database         │                 │
│  │ • Generate JWT token           │                 │
│  │ • Set httpOnly cookie          │                 │
│  └──────────────┬─────────────────┘                 │
│                 │                                    │
│                 ↓                                    │
│  ┌────────────────────────────────┐                 │
│  │ Cookie: session=<JWT>          │                 │
│  │ • httpOnly: true               │                 │
│  │ • secure: true                 │                 │
│  │ • sameSite: lax                │                 │
│  │ • expires: 24h                 │                 │
│  └──────────────┬─────────────────┘                 │
│                 │                                    │
│                 ↓                                    │
│  ┌────────────────────────────────┐                 │
│  │ Middleware                     │                 │
│  │ • Reads cookie on each request │                 │
│  │ • Verifies JWT                 │                 │
│  │ • Refreshes token if needed    │                 │
│  └──────────────┬─────────────────┘                 │
│                 │                                    │
│            Valid session                             │
│                 │                                    │
│                 ↓                                    │
│  ┌────────────────────────────────┐                 │
│  │ Protected Routes               │                 │
│  │ • /dashboard                   │                 │
│  │ • /my-app                      │                 │
│  └──────────────┬─────────────────┘                 │
│                 │                                    │
│                 │ User clicks logout                │
│                 ↓                                    │
│  ┌────────────────────────────────┐                 │
│  │ Clear Cookie                   │                 │
│  │ • Set expiry to past date      │                 │
│  │ • Redirect to /sign-in         │                 │
│  └────────────────────────────────┘                 │
│                                                       │
└──────────────────────────────────────────────────────┘
```

## Component Communication

```
┌─────────────────────────────────────────────────────┐
│                   MAIN APP LAYOUT                    │
│  ┌───────────────────────────────────────────────┐  │
│  │ app/layout.tsx                                │  │
│  │ • Provides <html>, <body>                    │  │
│  │ • Imports globals.css                        │  │
│  │ • Sets up fonts                              │  │
│  │ • Renders children                           │  │
│  └────────────────┬──────────────────────────────┘  │
│                   │                                  │
│                   │ renders                          │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │ MY-APP LAYOUT                                 │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │ my-app/app/layout.tsx                   │  │  │
│  │  │ • Imports ../../../app/globals.css      │  │  │
│  │  │ • Renders children (no html/body)       │  │  │
│  │  └───────────────┬─────────────────────────┘  │  │
│  │                  │                             │  │
│  │                  │ renders                     │  │
│  │                  ↓                             │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │ MY-APP PAGES                            │  │  │
│  │  │  ┌────────────────────────────────────┐ │  │  │
│  │  │  │ Sidebar                            │ │  │  │
│  │  │  │ • Uses appConfig.name              │ │  │  │
│  │  │  │ • Logout handler                   │ │  │  │
│  │  │  └────────────────────────────────────┘ │  │  │
│  │  │                                         │  │  │
│  │  │  ┌────────────────────────────────────┐ │  │  │
│  │  │  │ Project Grid                       │ │  │  │
│  │  │  │ • Uses theme colors                │ │  │  │
│  │  │  │ • Calls server actions             │ │  │  │
│  │  │  └────────────────────────────────────┘ │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

Configuration Flow:
┌──────────────┐
│ lib/config.ts│
│ • app name   │
│ • settings   │
└──────┬───────┘
       │
       │ imported by
       │
       ↓
┌──────────────────┐
│ my-app/components│
│ • sidebar.tsx    │
│ • uses appConfig │
└──────────────────┘
```
