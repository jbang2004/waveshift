# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
- `npm run dev` - Start development server with Turbopack on port 3001
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint for code quality

### Build & Deploy
- `npm run build` - Create production build
- `npm run deploy` - Build and deploy to Cloudflare Workers
- `npm run preview` - Preview production build locally

### Database Management
- `npm run db:generate` - Generate Drizzle schema migrations
- `npm run db:migrate` - Apply database migrations
- `npm run db:studio` - Open Drizzle Studio for visual DB management
- `npm run db:rebuild` - Rebuild local D1 database
- `npx wrangler d1 execute DB --local --command="SELECT * FROM users"` - Query local database

## Architecture Overview

This is a Next.js 15 application designed specifically for Cloudflare Workers edge runtime. Key architectural decisions:

### Edge-First Design
- Uses `@opennextjs/cloudflare` adapter for Cloudflare Workers deployment
- Cloudflare D1 (SQLite) database with Drizzle ORM
- Cloudflare R2 for object storage
- All API routes must be edge-compatible

### Authentication System
- Custom JWT implementation using `@tsndr/cloudflare-worker-jwt`
- Authentication endpoints: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/me`
- JWT tokens stored as HttpOnly cookies with 15-minute access tokens and 30-day refresh tokens
- Client-side auth state managed via AuthContext in `app/providers/auth-provider.tsx`

### Data Fetching Patterns
- Server Components for initial data loading
- React Query (TanStack Query) for client-side state management
- SWR also available as alternative
- Form handling with react-hook-form + zod validation

### UI Architecture
- Tailwind CSS with shadcn/ui component library
- Radix UI primitives for accessibility
- Framer Motion for animations
- Multi-language support via LanguageProvider (Chinese/English)

### Media Processing Features
- Audio transcription tasks
- Text-to-speech generation
- Video translation capabilities
- HLS.js for video streaming
- Task status tracking system

### Project Structure Conventions
- App Router with nested layouts in `/app`
- API routes in `/app/api` (must be edge-compatible)
- Shared components in `/components` (shadcn/ui in `/components/ui`)
- Database schema in `/db/schema.ts`
- Custom hooks in `/hooks`
- Utility functions in `/lib`

### Important Configuration Files
- `wrangler.jsonc` - Cloudflare Workers configuration
- `.dev.vars` - Local development environment variables
- `drizzle.config.ts` - Database configuration

### Development Notes
- Always ensure code is edge-compatible (no Node.js-specific APIs)
- Use absolute imports from `@/` for consistency
- Follow existing patterns for component structure and naming
- Test database operations locally before deployment
- Environment variables in production must be set in Cloudflare dashboard