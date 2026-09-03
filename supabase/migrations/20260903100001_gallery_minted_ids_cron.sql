-- Schedule periodic refresh of gallery minted token IDs (hosted Supabase with pg_cron + pg_net).
-- No-op locally if extensions or vault secrets are unavailable.

DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available — gallery minted-ID cron skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net not available — gallery minted-ID cron skipped';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('gallery-refresh-minted-ids');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    'gallery-refresh-minted-ids',
    '*/10 * * * *',
    $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'project_url'
        LIMIT 1
      ) || '/functions/v1/gallery-refresh-minted-ids',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'gallery minted-ID cron not scheduled: %', SQLERRM;
END;
$outer$;
