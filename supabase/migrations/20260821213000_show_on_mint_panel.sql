ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS show_on_mint_panel BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_collections_mint_panel
  ON public.collections (show_on_mint_panel)
  WHERE status = 'published' AND contract_address IS NOT NULL;
