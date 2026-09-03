-- Optional comma-separated token ID list to limit which collection tokens appear on a panel.
ALTER TABLE public.gallery_config
  ADD COLUMN IF NOT EXISTS allowed_token_ids text;
