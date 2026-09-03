-- Server-side cache of on-chain minted token IDs for gallery contracts (avoids client log scans).

CREATE TABLE IF NOT EXISTS public.gallery_contract_minted_ids (
  contract_address text PRIMARY KEY,
  minted_token_ids integer[] NOT NULL DEFAULT '{}',
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_contract_minted_ids_refreshed
  ON public.gallery_contract_minted_ids (refreshed_at);

ALTER TABLE public.gallery_contract_minted_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_contract_minted_ids_public_read ON public.gallery_contract_minted_ids
  FOR SELECT USING (true);

-- Writes via edge functions (service role)
