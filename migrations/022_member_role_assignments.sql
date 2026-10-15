-- Keep the Admin-selected member role as a real relationship, separate from
-- the base access role used for permissions (Sales / Viewer / Admin).
ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS member_role_id TEXT REFERENCES member_roles(id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS member_role_id TEXT REFERENCES member_roles(id);

UPDATE employee_profiles ep
SET member_role_id = mr.id
FROM member_roles mr
WHERE ep.member_role_id IS NULL
  AND lower(mr.name) = lower(COALESCE(ep.role_label, ''));

UPDATE users u
SET member_role_id = ep.member_role_id
FROM employee_profiles ep
WHERE ep.user_id = u.id
  AND u.member_role_id IS NULL
  AND ep.member_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS employee_profiles_member_role_id_idx
  ON employee_profiles(member_role_id);

CREATE INDEX IF NOT EXISTS users_member_role_id_idx
  ON users(member_role_id);
