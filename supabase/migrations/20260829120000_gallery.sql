-- 3D NFT Gallery: panel configuration and gem-based locks

CREATE TABLE IF NOT EXISTS public.gallery_config (
  panel_key text PRIMARY KEY,
  collection_name text,
  contract_address text,
  default_token_id integer DEFAULT 1,
  show_collection boolean DEFAULT false,
  wall_color text,
  text_color text,
  updated_at timestamptz DEFAULT now(),
  updated_by_address text
);

CREATE TABLE IF NOT EXISTS public.panel_locks (
  panel_id text PRIMARY KEY,
  contract_address text,
  token_id text,
  locked_by_address text NOT NULL,
  locked_until timestamptz NOT NULL,
  locking_gem_token_id text
);

CREATE INDEX IF NOT EXISTS idx_panel_locks_locked_until ON public.panel_locks (locked_until);

ALTER TABLE public.gallery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_config_public_read ON public.gallery_config
  FOR SELECT USING (true);

CREATE POLICY panel_locks_public_read ON public.panel_locks
  FOR SELECT USING (true);

-- Writes go through edge functions (service role)
