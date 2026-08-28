-- Gem Shards uses on-chain random mint; flag collection rows accordingly.
UPDATE public.collections
SET random_public_mint = true
WHERE symbol = 'GSHARD';
