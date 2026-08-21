-- Storage policies were missing on the remote project; RLS blocked all client uploads.

CREATE POLICY collection_images_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'collection-images');

CREATE POLICY collection_metadata_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'collection-metadata');

CREATE POLICY collection_images_write ON storage.objects
  FOR ALL
  USING (bucket_id = 'collection-images')
  WITH CHECK (bucket_id = 'collection-images');

CREATE POLICY collection_metadata_write ON storage.objects
  FOR ALL
  USING (bucket_id = 'collection-metadata')
  WITH CHECK (bucket_id = 'collection-metadata');
