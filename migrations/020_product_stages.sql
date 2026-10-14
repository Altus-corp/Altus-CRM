CREATE TABLE IF NOT EXISTS product_stages (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES master_values(id),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, label)
);

CREATE INDEX IF NOT EXISTS product_stages_product_idx ON product_stages(product_id, active, sort_order);
