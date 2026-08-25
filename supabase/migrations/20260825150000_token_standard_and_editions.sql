-- Future collections: ERC-721 V2 (full ERC-4906) and ERC-1155 edition support.
-- Existing rows default to legacy ERC-721 V1 (contract_version = 1).

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS token_standard TEXT NOT NULL DEFAULT 'erc721'
    CHECK (token_standard IN ('erc721', 'erc1155')),
  ADD COLUMN IF NOT EXISTS contract_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE collection_tokens
  ADD COLUMN IF NOT EXISTS edition_size INTEGER NOT NULL DEFAULT 1
    CHECK (edition_size > 0);

COMMENT ON COLUMN collections.contract_version IS '1 = legacy EditableERC721, 2 = EditableERC721V2 or EditableERC1155 via V2 factories';
COMMENT ON COLUMN collections.token_standard IS 'erc721 or erc1155; only applies when contract_version = 2';
COMMENT ON COLUMN collection_tokens.edition_size IS 'ERC-1155 copies per token id; always 1 for ERC-721';

INSERT INTO platform_config (key, value)
VALUES ('launchpad_v2_preview_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
