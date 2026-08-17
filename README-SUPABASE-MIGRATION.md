# Rehoboth Clinic HMS — Supabase + Vercel Migration

This build preserves the existing UI, portals, workflows and business-facing behaviour while replacing Firebase authentication/database integration with Supabase Auth + PostgreSQL.

## What changed

- Supabase Auth replaces Firebase Auth.
- PostgreSQL replaces Firestore.
- Row Level Security (RLS) is enabled across application tables.
- Staff roles are stored server-side in `public.users` and used by RLS policies.
- Staff provisioning uses the `create-staff` Supabase Edge Function; service-role credentials never enter the browser.
- Patient-card numbering uses an atomic Postgres function instead of a client-writable counter.
- Audit logs are append-only and cannot be updated/deleted from the client.
- Added patient allergy and consent foundations.
- Added FHIR Patient interoperability endpoint foundation.
- Removed the Vite client-side Gemini secret injection.
- Added Vercel SPA routing support.
- Firebase-specific configuration and dependencies were removed.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Enable Email authentication. Do not enable Google OAuth; CMD and staff use email/password.
4. Configure the redirect URL to the production Vercel URL and local development URL.
5. Deploy `supabase/functions/bootstrap-cmd`.
6. Deploy `supabase/functions/create-staff`.
7. Deploy `supabase/functions/fhir-patient`.
8. Set the function secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` and `INITIAL_CMD_EMAIL` using Supabase's secret management. **Never put the service role key in `VITE_*` variables.**
8. Set the Vercel environment variables from `.env.example`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

## First administrator

The first CMD account is controlled by `VITE_INITIAL_CMD_EMAIL`. This is deliberately an environment variable rather than a hard-coded email address.

The account must exist in Supabase Auth. On first successful sign-in, the application creates the corresponding CMD profile if it does not already exist.

## Staff onboarding

CMD creates a staff invitation from the Staff Management interface. The browser calls the `create-staff` Edge Function. The Edge Function verifies that the caller is an active CMD, creates the Auth invitation, and creates an `invited` staff profile. The account is not activated until the invite flow is completed.

## Healthcare standards scope

This migration is **standards-aligned engineering work, not a certification**. WHO's Digital Clearinghouse assesses digital-health solutions across functional/non-functional requirements, interoperability, health content, scalability/maintainability, privacy/security and patient safety. This project adds foundations in those areas, including RLS, immutable audit logs, consent/allergy records, indexed access control and a FHIR-compatible Patient endpoint. Clinical content still requires review and localization by qualified clinical and regulatory stakeholders before real patient use.

The FHIR endpoint is a limited interoperability foundation, not a claim of full FHIR conformance across the entire hospital information system.

## Production safety

Use synthetic data until the clinic has completed privacy, security, clinical-safety, backup/recovery and regulatory validation. Do not place service-role keys, database passwords, or patient data in source control.


## Verification status

The project has been statically inspected after the Supabase migration. The frontend intentionally retains a compatibility adapter (`src/lib/firestoreAdapter.ts`) so the existing UI and workflows can continue to operate while the backend is Supabase/PostgreSQL. This is a migration compatibility layer, not a Firebase dependency.

A clean production `npm install`/`vite build` could not be completed in the current execution environment because dependency installation timed out. Therefore this package must not be described as build-verified until `npm install` and `npm run build` complete successfully in a normal Node/Vercel build environment.

The schema also includes explicit execution grants for SECURITY DEFINER role-helper functions so anonymous/public callers cannot execute them.

## V6 authentication reset

The browser authentication path is email/password only and uses Supabase Auth directly. There is no Google OAuth path and no Firebase authentication dependency. Missing Supabase build-time environment variables now fail the build/runtime initialization instead of silently falling back to a placeholder endpoint.
