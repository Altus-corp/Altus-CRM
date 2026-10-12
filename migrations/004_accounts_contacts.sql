CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  source_id TEXT UNIQUE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  website TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source_checksum TEXT,
  import_run_id TEXT REFERENCES import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  source_id TEXT UNIQUE,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  alternate_phone TEXT,
  designation TEXT,
  source_checksum TEXT,
  import_run_id TEXT REFERENCES import_runs(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_leads (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'linked',
  source_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, lead_id)
);

CREATE INDEX IF NOT EXISTS accounts_normalized_name_idx ON accounts(normalized_name);
CREATE INDEX IF NOT EXISTS accounts_owner_status_idx ON accounts(owner_user_id, status);
CREATE INDEX IF NOT EXISTS contacts_account_status_idx ON contacts(account_id, status);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_leads_lead_idx ON contact_leads(lead_id);
