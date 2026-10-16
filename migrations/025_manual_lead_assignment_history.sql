-- Manual assignment writes an ownership history entry for every affected lead.
-- This keeps a lead's assignment timeline fast to read as the history grows.
CREATE INDEX IF NOT EXISTS lead_history_owner_assignment_idx
  ON lead_history(lead_id, occurred_at DESC)
  WHERE field = 'owner_user_id';
