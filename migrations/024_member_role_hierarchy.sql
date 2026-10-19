-- Configurable reporting hierarchy for member roles.
-- A role can report to one higher role; users keep their existing member_role_id.
ALTER TABLE member_roles
  ADD COLUMN IF NOT EXISTS hierarchy_parent_id TEXT REFERENCES member_roles(id) ON DELETE SET NULL;

ALTER TABLE member_roles
  ADD COLUMN IF NOT EXISTS hierarchy_rank INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS member_roles_hierarchy_parent_idx
  ON member_roles(hierarchy_parent_id, active, hierarchy_rank, name);

-- Optional sensible starting hierarchy for standard roles.
UPDATE member_roles child
SET hierarchy_parent_id = parent.id,
    hierarchy_rank = 1
FROM member_roles parent
WHERE child.name = 'Sales'
  AND parent.name = 'Admin'
  AND child.hierarchy_parent_id IS NULL;
