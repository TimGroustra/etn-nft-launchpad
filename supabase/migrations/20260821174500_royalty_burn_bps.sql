ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS royalty_burn_bps INTEGER NOT NULL DEFAULT 0
  CHECK (royalty_burn_bps >= 0 AND royalty_burn_bps <= 10000);

ALTER TABLE collections DROP COLUMN IF EXISTS burn_on_resale;
