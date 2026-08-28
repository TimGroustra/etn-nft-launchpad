import { useParams } from 'react-router-dom'
import { useCollection } from '@/hooks/useCollections'
import { getExplorerContractUrl, getChainKey } from '@/lib/blockchain'
import { formatMintModeLabel, formatPercentFromBps } from '@/lib/create-collection-validation'
import { shortenAddress } from '@/lib/utils'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { isGemShardsContract } from '@/lib/gem-shards'
import { GemShardsMintPanel } from '@/components/GemShardsMintPanel'

export function CollectionPage() {
  const { address } = useParams()
  const { data: collection, isLoading } = useCollection(address)
  const { data: platformConfig } = usePlatformConfig()

  if (isLoading) return <p className="text-slate-400">Loading collection...</p>
  if (!collection) return <p className="text-red-400">Collection not found</p>

  const networkKey = getChainKey(collection.chain_id ?? 52014)
  const isGemShards =
    collection.contract_address
    && isGemShardsContract(collection.contract_address, networkKey, {
      gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
      gem_shards_testnet: platformConfig?.gem_shards_testnet,
    })

  if (isGemShards && collection.contract_address) {
    return (
      <GemShardsMintPanel
        variant="page"
        collection={collection}
        contractAddress={collection.contract_address as `0x${string}`}
        chainId={collection.chain_id ?? 52014}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{collection.name}</h1>
        <p className="text-slate-400">{collection.description}</p>
        <p className="mt-2 text-sm text-slate-500">
          Contract:{' '}
          {collection.contract_address && collection.chain_id != null ? (
            <a
              href={getExplorerContractUrl(collection.chain_id, collection.contract_address)}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              {shortenAddress(collection.contract_address)}
            </a>
          ) : (
            'Not deployed'
          )}
        </p>
        <p className="text-sm text-slate-500">
          Mint: {formatMintModeLabel(collection.mint_mode)}
          {Number(collection.mint_price_etn) > 0 &&
            ` · Paid sale: ${collection.mint_price_etn} ETN${collection.random_public_mint ? ' (random order)' : ''}`}
          {collection.chain_id === 5201420 ? ' · Testnet' : collection.chain_id === 52014 ? ' · Mainnet' : ''}
        </p>
        {(collection.burn_on_mint || Number(collection.royalty_burn_bps ?? 0) > 0) && (
          <p className="text-sm text-amber-400">
            {collection.burn_on_mint && Number(collection.mint_burn_bps ?? 0) > 0 && (
              <>Mint CLUB burn: {formatPercentFromBps(collection.mint_burn_bps)} of mint price · </>
            )}
            {Number(collection.royalty_burn_bps ?? 0) > 0 && (
              <>Royalties burn: {Number(collection.royalty_burn_bps) / 100}% ETN swapped to CLUB</>
            )}
          </p>
        )}
      </div>
      <p className="text-slate-400">Mint this collection from the home NFT Minting Panel.</p>
    </div>
  )
}
