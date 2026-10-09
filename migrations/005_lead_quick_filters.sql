CREATE TABLE IF NOT EXISTS lead_quick_filters (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  view_key TEXT NOT NULL DEFAULT '',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions JSONB NOT NULL,
  join_operator TEXT NOT NULL DEFAULT 'AND' CHECK (join_operator IN ('AND', 'OR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS lead_quick_filters_owner_updated_idx ON lead_quick_filters(owner_user_id, updated_at DESC);
