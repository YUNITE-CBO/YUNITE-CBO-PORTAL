# Supabase integration guide

## Environment variables

Set the following values before starting the backend:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- DATABASE_URL

## What is wired today

- Centralized Supabase client initialization via the core services layer
- Server-side auth middleware powered by Supabase Auth
- Storage buckets for documents, member photos, organization logos, reports, receipts, and attachments
- Health check endpoint reporting Supabase integration status
- Migration scaffolding that runs at startup

## Notes

- The service role key must remain server-side only.
- Replace the current Prisma-based engine code incrementally with the shared Supabase services to eliminate any remaining duplicate persistence paths.
