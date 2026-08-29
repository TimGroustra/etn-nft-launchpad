-- Gallery panel media cache: queue + storage for fast, steady image warmup

INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-cache', 'gallery-cache', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY gallery_cache_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'gallery-cache');

CREATE POLICY gallery_cache_service_all ON storage.objects
  FOR ALL USING (bucket_id = 'gallery-cache')
  WITH CHECK (bucket_id = 'gallery-cache');

CREATE TABLE IF NOT EXISTS public.gallery_media_cache (
  contract_address text NOT NULL,
  token_id integer NOT NULL,
  title text,
  content_type text NOT NULL,
  storage_path text NOT NULL,
  source_url text,
  cached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_address, token_id)
);

CREATE TABLE IF NOT EXISTS public.gallery_cache_queue (
  id bigserial PRIMARY KEY,
  contract_address text NOT NULL,
  token_id integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_address, token_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_cache_queue_pending
  ON public.gallery_cache_queue (created_at)
  WHERE status = 'pending';

ALTER TABLE public.gallery_media_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_cache_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_media_cache_public_read ON public.gallery_media_cache
  FOR SELECT USING (true);

-- Queue + cache writes via edge functions (service role)
