-- Lets requireUser() detect that the session currently in a user's browser
-- was issued before an admin reset their password, so that session is
-- forced to sign out and re-authenticate instead of continuing silently.
alter table public.profiles
  add column if not exists password_changed_at timestamptz;
