# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Alltagsengel is a Next.js 16 (Turbopack) care companion marketplace connecting customers (Kunden) with certified care companions (Engel). The UI language is German. It uses a cloud-hosted Supabase instance for database, auth, and realtime — no local database setup is needed.

### Running the app
- `npm run dev` starts the dev server on port 3000.
- Environment variables are in `.env` (Supabase URL + anon key). No additional secrets are required for basic dev work.
- The login page (`/auth/login`) has **DEMO ZUGANG** buttons (Admin, Engel, Kunde) for quick access without creating accounts.

### Lint / Build / Test
- **Lint**: `npm run lint` (runs ESLint 9 with `eslint-config-next`). The codebase has pre-existing lint warnings (`@typescript-eslint/no-explicit-any`, `react-hooks/immutability`).
- **Build**: `npm run build`. Note: production build may fail due to a duplicate `IconShield` export in `components/Icons.tsx` (Turbopack strict mode). Dev server is unaffected for most pages.
- **Tests**: No automated test framework is configured. Manual testing via the browser is the primary approach.

### Known caveats
- `components/Icons.tsx` has a duplicate `export function IconShield` (lines 85 and 251) that causes Turbopack production build errors. The dev server compiles pages on demand and may or may not hit this depending on the route.
- `SUPABASE_SERVICE_ROLE_KEY` is not set in `.env` — admin password-reset API (`/api/admin/reset-password`) will not work without it.
- Payment (Stripe) and email (Resend) integrations are commented out / mocked.
