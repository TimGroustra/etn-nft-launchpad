import { useParams } from 'react-router-dom'
import { useCollection, useCollectionTokens } from '@/hooks/useCollections'
import { getPublicImageUrl } from '@/lib/supabase'
import { getExplorerContractUrl } from '@/lib/blockchain'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { formatMintModeLabel, formatPercentFromBps } from '@/lib/create-collection-validation'
import { shortenAddress } from '@/lib/utils'

export function CollectionPage() {
  const { address } = useParams()
  const { data: collection, isLoading } = useCollection(address)
  const { data: tokens = [] } = useCollectionTokens(collection?.id)

  if (isLoading) return <p className="text-slate-400">Loading collection...</p>
  if (!collection) return <p className="text-red-400">Collection not found</p>

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
        {collection.contract_address && (
          <p className="text-xs text-slate-500">
            Block explorers may not preview unminted NFTs for contracts published before the latest factory update.
            Minted tokens appear on the explorer normally.
          </p>
        )}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((token) => (
          <Card key={token.id}>
            {token.image_storage_path && (
              <img
                src={getPublicImageUrl(token.image_storage_path)}
                alt={token.name}
                className="mb-3 aspect-square w-full rounded-lg object-cover"
              />
            )}
            <CardTitle>{token.name}</CardTitle>
            <CardDescription>{token.description}</CardDescription>
          </Card>
        ))}
      </div>
    </div>
  )
}
