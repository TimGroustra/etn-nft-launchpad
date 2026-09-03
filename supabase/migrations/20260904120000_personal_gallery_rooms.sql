-- Personal ElectroGem gallery rooms (one room per gem NFT)

CREATE TABLE IF NOT EXISTS public.personal_gallery_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  owner_address text NOT NULL,
  electrogem_token_id text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_gallery_rooms_owner
  ON public.personal_gallery_rooms (owner_address);

ALTER TABLE public.personal_gallery_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_gallery_rooms_public_read ON public.personal_gallery_rooms
  FOR SELECT USING (true);

ALTER TABLE public.gallery_config
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.personal_gallery_rooms(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gallery_config_room_id
  ON public.gallery_config (room_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_config_room_panel
  ON public.gallery_config (room_id, panel_key)
  WHERE room_id IS NOT NULL;

ALTER TABLE public.gallery_panel_tokens
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.personal_gallery_rooms(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gallery_panel_tokens_room_id
  ON public.gallery_panel_tokens (room_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_panel_tokens_room_panel
  ON public.gallery_panel_tokens (room_id, panel_key)
  WHERE room_id IS NOT NULL;
