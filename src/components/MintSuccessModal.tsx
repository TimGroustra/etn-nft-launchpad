import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getExplorerNftUrl, type ParsedMintAssignment } from '@/lib/blockchain'
import { getPublicImageUrl } from '@/lib/supabase'
import type { CollectionToken } from '@/types/database'

export type MintedTokenInfo = {
  tokenId: number
  name: string
  imageUrl: string | null
  amount?: number
}

type MintSuccessModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionName: string
  contractAddress: string
  chainId: number
  mintedTokens: MintedTokenInfo[]
}

export function buildMintedTokenInfo(
  assignments: ParsedMintAssignment[],
  tokens: CollectionToken[],
): MintedTokenInfo[] {
  return assignments.map(({ onChainTokenId, metadataIndex }) => {
    const token = tokens.find((row) => row.token_id === metadataIndex)
    return {
      tokenId: onChainTokenId,
      name: token?.name?.trim() || `Token #${onChainTokenId}`,
      imageUrl: token?.image_storage_path ? getPublicImageUrl(token.image_storage_path) : null,
    }
  })
}

export function MintSuccessModal({
  open,
  onOpenChange,
  collectionName,
  contractAddress,
  chainId,
  mintedTokens,
}: MintSuccessModalProps) {
  const count = mintedTokens.length
  const single = count === 1 ? mintedTokens[0] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint successful</DialogTitle>
          <DialogDescription>
            {count === 1
              ? single?.amount && single.amount > 1
                ? `You minted ${single.amount} × ${single.name} from ${collectionName}.`
                : `You minted ${single?.name} from ${collectionName}.`
              : `You minted ${count} NFTs from ${collectionName}.`}
          </DialogDescription>
        </DialogHeader>

        {single ? (
          <div className="space-y-4">
            {single.imageUrl ? (
              <img
                src={single.imageUrl}
                alt={single.name}
                className="aspect-square w-full rounded-lg border border-slate-800 object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-500">
                #{single.tokenId}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{single.name}</p>
                <p className="text-sm text-slate-400">Token #{single.tokenId}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={getExplorerNftUrl(chainId, contractAddress, single.tokenId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto pr-1">
            {mintedTokens.map((token) => (
              <div
                key={token.tokenId}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3"
              >
                {token.imageUrl ? (
                  <img
                    src={token.imageUrl}
                    alt={token.name}
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs text-slate-500">
                    #{token.tokenId}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{token.name}</p>
                  <p className="text-sm text-slate-400">Token #{token.tokenId}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={getExplorerNftUrl(chainId, contractAddress, token.tokenId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button className="w-full" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  )
}
