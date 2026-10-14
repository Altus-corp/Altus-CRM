CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preference_key)
);

CREATE INDEX IF NOT EXISTS user_preferences_key_idx ON user_preferences(preference_key);
