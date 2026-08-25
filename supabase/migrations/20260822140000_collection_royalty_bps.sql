ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS royalty_bps INTEGER NOT NULL DEFAULT 500
  CHECK (royalty_bps >= 0 AND royalty_bps <= 10000);
