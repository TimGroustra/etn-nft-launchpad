-- Ensure token storage paths always stay inside their collection folder (UUID prefix).

ALTER TABLE public.collection_tokens
  DROP CONSTRAINT IF EXISTS collection_tokens_image_path_collection_scoped;

ALTER TABLE public.collection_tokens
  ADD CONSTRAINT collection_tokens_image_path_collection_scoped
  CHECK (
    image_storage_path IS NULL
    OR split_part(image_storage_path, '/', 1) = collection_id::text
  );

ALTER TABLE public.collection_tokens
  DROP CONSTRAINT IF EXISTS collection_tokens_metadata_path_collection_scoped;

ALTER TABLE public.collection_tokens
  ADD CONSTRAINT collection_tokens_metadata_path_collection_scoped
  CHECK (
    metadata_storage_path IS NULL
    OR split_part(metadata_storage_path, '/', 1) = collection_id::text
  );

-- Client uploads must go through edge functions (service role). Remove open write policies.
DROP POLICY IF EXISTS collection_images_write ON storage.objects;
DROP POLICY IF EXISTS collection_metadata_write ON storage.objects;
