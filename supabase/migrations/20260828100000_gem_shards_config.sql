-- Gem Shards platform config (draft until admin publishes from dashboard)
INSERT INTO platform_config (key, value)
VALUES
  ('gem_shards_mainnet', '0x0000000000000000000000000000000000000000'),
  ('gem_shards_testnet', '0x0000000000000000000000000000000000000000'),
  ('publish_fee_distributor_mainnet', '0x0000000000000000000000000000000000000000'),
  ('publish_fee_distributor_testnet', '0x0000000000000000000000000000000000000000'),
  ('gem_shards_status_mainnet', 'draft'),
  ('gem_shards_status_testnet', 'draft')
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('gem-shards', 'gem-shards', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY gem_shards_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'gem-shards');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'gem_shards_service_all' AND tablename = 'objects'
  ) THEN
    CREATE POLICY gem_shards_service_all ON storage.objects
      FOR ALL USING (bucket_id = 'gem-shards') WITH CHECK (bucket_id = 'gem-shards');
  END IF;
END $$;

-- Platform Gem Shards collection rows (draft until admin publishes from dashboard)
INSERT INTO public.collections (
  creator_wallet,
  name,
  symbol,
  description,
  status,
  mint_mode,
  max_supply,
  mint_price_etn,
  max_mint_per_wallet,
  show_on_mint_panel,
  chain_id,
  contract_version,
  token_standard
)
SELECT
  '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d',
  'Gem Shards',
  'GSHARD',
  'Hold Gem Shards to earn a share of launchpad platform fees. ElectroGem holders get one free shard per gem (IDs 1–49).',
  'draft',
  'batch',
  495,
  50000,
  0,
  true,
  v.chain_id,
  2,
  'erc721'
FROM (VALUES (52014), (5201420)) AS v(chain_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.collections c
  WHERE c.symbol = 'GSHARD' AND c.chain_id = v.chain_id
);
