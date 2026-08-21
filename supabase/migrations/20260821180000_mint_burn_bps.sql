-- Mint CLUB burn is a percentage of public mint price (basis points), not a fixed CLUB amount.
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS mint_burn_bps SMALLINT NOT NULL DEFAULT 0
  CHECK (mint_burn_bps >= 0 AND mint_burn_bps <= 10000);
