-- Case-insensitive wallet matching expects lowercase creator_wallet values.
UPDATE public.collections
SET creator_wallet = lower(creator_wallet)
WHERE creator_wallet <> lower(creator_wallet);

-- Gem Shards drafts should stay off the public mint panel until published.
UPDATE public.collections
SET show_on_mint_panel = false
WHERE symbol = 'GSHARD' AND status = 'draft';
