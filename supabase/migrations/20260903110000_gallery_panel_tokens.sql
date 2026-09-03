-- Indexed panel → token mapping for gallery media (resolved from gallery_config + minted IDs).
-- Lets the client query which panels are cached in Supabase vs still warming.

CREATE TABLE IF NOT EXISTS public.gallery_panel_tokens (
  panel_key text PRIMARY KEY,
  contract_address text NOT NULL,
  token_id integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_panel_tokens_contract_token
  ON public.gallery_panel_tokens (contract_address, token_id);

CREATE INDEX IF NOT EXISTS idx_gallery_media_cache_contract
  ON public.gallery_media_cache (contract_address);

ALTER TABLE public.gallery_panel_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_panel_tokens_public_read ON public.gallery_panel_tokens
  FOR SELECT USING (true);

-- Writes via edge functions (service role)
