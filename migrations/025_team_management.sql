-- Teams are owned by a manager. User accounts remain created by Admin only.
CREATE TABLE IF NOT EXISTS crm_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manager_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manager_user_id, name)
);

CREATE TABLE IF NOT EXISTS crm_team_members (
  team_id TEXT NOT NULL REFERENCES crm_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS crm_teams_manager_active_idx ON crm_teams(manager_user_id, active, name);
CREATE INDEX IF NOT EXISTS crm_team_members_user_idx ON crm_team_members(user_id, team_id);
