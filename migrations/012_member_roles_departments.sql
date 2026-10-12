CREATE TABLE IF NOT EXISTS member_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  access_role TEXT NOT NULL CHECK (access_role IN ('Sales', 'Viewer', 'Admin')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS role_label TEXT;

INSERT INTO member_roles (id, name, access_role)
VALUES ('member-role-sales', 'Sales', 'Sales'), ('member-role-viewer', 'Viewer', 'Viewer'), ('member-role-admin', 'Admin', 'Admin')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS member_roles_active_name_idx ON member_roles(active, name);
CREATE INDEX IF NOT EXISTS departments_active_name_idx ON departments(active, name);

INSERT INTO departments (id, name)
SELECT 'department-team-' || md5(btrim(team)), btrim(team)
FROM employee_profiles
WHERE team IS NOT NULL AND btrim(team) <> ''
ON CONFLICT (name) DO NOTHING;
