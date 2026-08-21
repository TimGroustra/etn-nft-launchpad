-- ETN NFT Launchpad schema

CREATE TABLE IF NOT EXISTS public.wallet_nonces (
  wallet_address TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_sessions_token ON public.wallet_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_wallet_sessions_wallet ON public.wallet_sessions(wallet_address);

CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  description TEXT,
  contract_address TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  mint_mode TEXT NOT NULL DEFAULT 'lazy' CHECK (mint_mode IN ('lazy', 'batch')),
  max_supply INTEGER NOT NULL DEFAULT 10000,
  club_burn_amount NUMERIC(36, 18) NOT NULL DEFAULT 0,
  burn_on_mint BOOLEAN NOT NULL DEFAULT false,
  burn_on_resale BOOLEAN NOT NULL DEFAULT false,
  storage_provider TEXT NOT NULL DEFAULT 'supabase' CHECK (storage_provider IN ('supabase', 'ipfs')),
  base_uri TEXT,
  publish_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_creator ON public.collections(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_collections_status ON public.collections(status);
CREATE INDEX IF NOT EXISTS idx_collections_contract ON public.collections(contract_address);

CREATE TABLE IF NOT EXISTS public.collection_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  token_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_storage_path TEXT,
  metadata_storage_path TEXT,
  token_uri TEXT,
  minted BOOLEAN NOT NULL DEFAULT false,
  mint_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_tokens_collection ON public.collection_tokens(collection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_tokens_unique ON public.collection_tokens(collection_id, token_id) WHERE token_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.publish_payments (
  transaction_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  amount_wei TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.wallet_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_payments ENABLE ROW LEVEL SECURITY;

-- Public read for collections and tokens
CREATE POLICY collections_public_read ON public.collections FOR SELECT USING (true);
CREATE POLICY collection_tokens_public_read ON public.collection_tokens FOR SELECT USING (true);

-- Service role handles writes via edge functions; allow anon insert for drafts with wallet session header validated in edge functions
CREATE POLICY collections_service_all ON public.collections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY collection_tokens_service_all ON public.collection_tokens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wallet_nonces_service_all ON public.wallet_nonces FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wallet_sessions_service_all ON public.wallet_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY publish_payments_service_all ON public.publish_payments FOR ALL USING (true) WITH CHECK (true);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('collection-images', 'collection-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('collection-metadata', 'collection-metadata', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY collection_images_public_read ON storage.objects FOR SELECT USING (bucket_id = 'collection-images');
CREATE POLICY collection_metadata_public_read ON storage.objects FOR SELECT USING (bucket_id = 'collection-metadata');
CREATE POLICY collection_images_service_all ON storage.objects FOR ALL USING (bucket_id = 'collection-images') WITH CHECK (bucket_id = 'collection-images');
CREATE POLICY collection_metadata_service_all ON storage.objects FOR ALL USING (bucket_id = 'collection-metadata') WITH CHECK (bucket_id = 'collection-metadata');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collections_updated_at BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER collection_tokens_updated_at BEFORE UPDATE ON public.collection_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
