-- Remove duplicate token rows (keep newest per collection + token_id)
DELETE FROM public.collection_tokens
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY collection_id, token_id
        ORDER BY updated_at DESC, id DESC
      ) AS rn
    FROM public.collection_tokens
    WHERE token_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_tokens_unique
  ON public.collection_tokens (collection_id, token_id)
  WHERE token_id IS NOT NULL;
