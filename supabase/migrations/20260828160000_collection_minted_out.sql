ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS minted_out BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.collections.minted_out IS
  'When true, the collection is fully minted on-chain and should appear in the mint panel sold-out section without an RPC availability check.';

CREATE INDEX IF NOT EXISTS idx_collections_mint_panel_minted_out
  ON public.collections (minted_out)
  WHERE show_on_mint_panel = true AND status = 'published';
