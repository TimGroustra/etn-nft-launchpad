ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS random_public_mint BOOLEAN NOT NULL DEFAULT false;
