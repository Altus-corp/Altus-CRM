ALTER TABLE lead_products ADD COLUMN IF NOT EXISTS funnel TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE lead_products ADD COLUMN IF NOT EXISTS call_stage TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS lead_products_lead_code_idx ON lead_products(lead_id, product_code);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(phone) WHERE phone IS NOT NULL;
