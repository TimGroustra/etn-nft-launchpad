-- One personal gallery room per wallet (holders need any ElectroGem, not one room per gem).

ALTER TABLE public.personal_gallery_rooms
  DROP CONSTRAINT IF EXISTS personal_gallery_rooms_electrogem_token_id_key;

ALTER TABLE public.personal_gallery_rooms
  ALTER COLUMN electrogem_token_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_gallery_rooms_owner_unique
  ON public.personal_gallery_rooms (owner_address);
