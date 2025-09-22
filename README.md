# Gas Receipt Tracking System (GRTS)

A serverless web application to track, manage, and report gas receipts.

- Frontend: React (Vite) + Tailwind CSS, hosted on Netlify
- Backend Logic: Supabase Edge Functions
- Database: Supabase PostgreSQL with RLS
- Auth: Supabase Auth (JWT)
- Storage: Supabase Storage (bucket: `receipts`)

## Prerequisites
- Node.js 18+
- A Supabase project (URL and anon key)
- Netlify account (for deploy)

## Environment Variables (Frontend)
Create `web/.env` or `web/.env.local` with:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_APP_ENV=development
```

Optional (for features that call Edge Functions behind Netlify if you proxy):
```
VITE_EDGE_BASE_URL=/
```

## Supabase Edge Function Secrets (Server)
Set these in Supabase project secrets for Edge Functions:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- POSTMARK_TOKEN (for email)
- WEX_API_BASE (if polling)
- WEX_API_KEY (if polling)

## Install and Run (Frontend)
```
cd web
npm install
npm run dev
```

## Build
```
cd web
npm run build
```

## Deploy to Netlify
- Configure your site to build the `web/` project.
- Build command: `npm run build`
- Publish directory: `web/dist`
- Environment: Node 18

## Supabase Setup
- Apply SQL in `design_sql.sql` to create tables, RLS, and storage policies.
- Deploy Edge Functions from `supabase/functions/*` using Supabase CLI:

```
supabase functions deploy upload-receipt
supabase functions deploy get-receipts
supabase functions deploy missing-receipts
supabase functions deploy generate-pdf
supabase functions deploy user-management
supabase functions deploy wex-webhook
supabase functions deploy wex-poll
supabase functions deploy notify
```

For scheduled polling, configure a Supabase Scheduled Function to invoke `wex-poll` daily.

## Monorepo Layout
- `web/` — React app
- `supabase/functions/` — Edge Functions (Deno)
- `design_sql.sql` — SQL schema & policies
- `netlify.toml` — Netlify SPA redirects & build env

## License
Proprietary
