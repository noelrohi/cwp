# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 (App Router) application that implements an intelligent podcast analysis and personalization system. The application processes podcast episodes, generates transcripts using Deepgram, creates embeddings, and delivers personalized "signals" to users based on their preferences and feedback.

## Common Commands

### Development
```bash
pnpm dev              # Start development server with Turbopack
pnpm start            # Start production server
```

### Code Quality
```bash
pnpm lint            # Run Biome linter checks
pnpm format          # Format code with Biome
pnpm typecheck       # Run TypeScript type checking
```

### Build
```bash
pnpm build           # Build production application with Turbopack
```

### Database (Drizzle ORM with PostgreSQL)
```bash
pnpm db:generate     # Generate migration files
pnpm db:migrate      # Run migrations
pnpm db:push         # Push schema changes directly (production)
pnpm db:push:dev     # Push schema changes to dev database
pnpm db:studio       # Open Drizzle Studio (production)
pnpm db:studio:dev   # Open Drizzle Studio (dev)
pnpm db:backfill:user-preferences  # Backfill user preferences script
```

### UI Components
```bash
pnpm ui              # Add shadcn components (runs shadcn CLI)
```

## Architecture

### Core Stack
- **Framework**: Next.js 15 with App Router and Turbopack
- **Database**: PostgreSQL with Drizzle ORM
- **API Layer**: tRPC for type-safe API calls
- **Authentication**: better-auth with Google and LinkedIn OAuth, email/password
- **Background Jobs**: Inngest for scheduled tasks and event-driven workflows
- **AI/ML**: OpenAI API, Deepgram for transcription, vector embeddings for personalization
- **Styling**: Tailwind CSS 4, Radix UI components, shadcn/ui
- **State Management**: TanStack Query (React Query)

### Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (app)/             # Authenticated app pages (dashboard, signals, podcasts, etc.)
│   ├── (auth)/            # Authentication pages (sign-in, sign-up)
│   └── api/               # API routes (Inngest, tRPC, better-auth)
├── components/            # React components (shadcn/ui + custom)
├── hooks/                 # Custom React hooks
├── inngest/              # Inngest background job functions
│   ├── functions/        # Individual Inngest function definitions
│   └── client.ts         # Inngest client configuration
├── lib/                  # Client-side utilities
│   ├── auth.ts           # better-auth configuration
│   ├── auth-client.ts    # better-auth client
│   ├── podscan.ts        # Podcast feed parsing
│   ├── embedding.ts      # Embedding generation utilities
│   └── prompt-utils.ts   # AI prompt utilities
├── server/               # Server-side code
│   ├── db/              # Database layer
│   │   ├── schema/      # Drizzle schema definitions (auth.ts, podcast.ts)
│   │   └── index.ts     # Database client
│   ├── trpc/            # tRPC API layer
│   │   ├── routers/     # API route handlers (episodes, podcasts, signals, users)
│   │   └── root.ts      # Root router combining all routers
│   └── lib/             # Server utilities
├── middleware.ts         # Next.js middleware (auth protection)
└── types/               # TypeScript type definitions
```

### Key Systems

#### 1. Daily Intelligence Pipeline (Inngest)
Located in `src/inngest/functions/`, the system runs automated background jobs:

- **Daily Intelligence Pipeline** (`daily-intelligence-pipeline.ts`): Runs at 2 AM daily
  - Fetches pending episodes
  - Generates transcripts via Deepgram
  - Chunks transcripts (400-800 words, respecting speaker turns)
  - Generates embeddings for chunks
  - Creates personalized signals for users based on their preference centroids

- **Continuous Learning** (`continuous-learning.ts`):
  - Updates user preference centroids when signals are saved/skipped
  - Weekly optimization (Sundays 3 AM): recomputes all centroids from historical data
  - Monthly cleanup (1st of month, 4 AM): deletes signals older than 90 days

- **Feed Parser** (`feed-parser.ts`): Imports new episodes from RSS feeds
- **Health Monitoring** (`health-monitoring.ts`): System health checks

See `src/inngest/README.md` for detailed pipeline documentation.

#### 2. Database Schema
Key tables (defined in `src/server/db/schema/`):

- **podcast.ts**:
  - `episode`: Podcast episodes with processing status
  - `transcript_chunk`: Chunked transcripts with embeddings (pgvector)
  - `daily_signal`: Personalized content recommendations for users
  - `saved_chunk`: User-saved content for training preferences
  - `user_preferences`: User centroid embeddings for personalization

- **auth.ts**: better-auth tables for users, sessions, accounts

#### 3. tRPC API Layer
Type-safe API routes in `src/server/trpc/routers/`:
- `episodes.ts`: Episode management and transcript retrieval
- `podcasts.ts`: Podcast CRUD and RSS feed management
- `signals.ts`: Daily signals, user feedback (save/skip), signal generation
- `users.ts`: User profile and preferences

Root router in `src/server/trpc/root.ts` combines all routers.

#### 4. Authentication Flow
- Uses better-auth with Drizzle adapter (PostgreSQL)
- Supports email/password, Google OAuth, LinkedIn OAuth
- Middleware in `src/middleware.ts` protects routes
- Auth config in `src/lib/auth.ts`, client in `src/lib/auth-client.ts`

#### 5. AI & Personalization
- **Embeddings**: Generated using OpenAI's text-embedding models
- **Transcription**: Deepgram API for podcast audio-to-text
- **Learning Algorithm**:
  1. Users start with zero centroid (neutral state)
  2. Saving content moves centroid toward saved embeddings
  3. Skipping content moves centroid away from skipped embeddings
  4. Learning rate decreases with more feedback
  5. Weekly recomputation from all historical data prevents drift

### Configuration Files

- `tsconfig.json`: TypeScript config with `@/*` path alias to `src/*`
- `biome.json`: Biome linter and formatter config (used instead of ESLint/Prettier)
- `drizzle.config.ts`: Production database config
- `drizzle.config.dev.ts`: Development database config
- `next.config.ts`: Next.js config with Shiki transpilation and browser debug info
- `tailwind.config.*`: Tailwind CSS 4 configuration

### Environment Variables

Required environment variables (typically in `.env.local`):
- `DATABASE_URL`: PostgreSQL connection string
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`: LinkedIn OAuth
- `OPENAI_API_KEY`: OpenAI API key for embeddings/completions
- `DEEPGRAM_API_KEY`: Deepgram API key for transcription
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`: Inngest configuration
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: Rate limiting (optional)

## Development Notes

### Testing Inngest Functions Locally
To test Inngest functions during development:
1. Start the dev server: `pnpm dev`
2. Visit `http://localhost:3000/api/inngest` to access the Inngest dev server UI
3. Trigger functions manually or send test events

### Database Workflow
1. Make schema changes in `src/server/db/schema/*.ts`
2. For development: `pnpm db:push:dev` (direct schema push)
3. For production: `pnpm db:generate` → `pnpm db:migrate` (versioned migrations)
4. View data: `pnpm db:studio` or `pnpm db:studio:dev`

### Adding UI Components
Use the shadcn CLI via `pnpm ui` to add new Radix-based components.

### Code Style
- Use Biome for linting and formatting (not ESLint/Prettier)
- Imports are auto-organized by Biome
- TypeScript strict mode is enabled
- Use `@/` imports for src files (e.g., `@/lib/utils`)

### App Router Conventions
- `(app)` directory: Authenticated routes with shared layout
- `(auth)` directory: Authentication pages (sign-in, sign-up)
- Route protection handled in `src/middleware.ts`
- Server components by default; use `"use client"` directive for client components

### Signals System
The core value proposition is the "signals" feature:
- Users subscribe to podcasts
- Daily pipeline generates personalized signals from new episodes
- Users save/skip signals, training their preference model
- System learns and improves recommendations over time