ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS mint_panel_admin_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.collections.mint_panel_admin_only IS
  'When true with show_on_mint_panel, collection appears on the home minting panel for admin wallets only.';
