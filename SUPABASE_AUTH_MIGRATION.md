# Supabase Auth migration v5

The CMD authentication bootstrap is fully Supabase-native:
- Supabase Auth handles email/password identity.
- `public.users` handles clinic authorization and role/status.
- The login bootstrap no longer reads the legacy Firebase `users` collection.
- CMD requires an active `public.users` row with role `CMD`.
- Google OAuth is not required.

Existing Firebase-backed clinical data access remains unchanged in this build unless separately migrated.
