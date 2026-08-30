import { useMemo } from "react";
import { toast } from 'sonner';
import {
  getElectroSwapAssetUrl,
  getRaribleItemUrl,
} from '@/lib/marketplace';

const MARKETPLACES = [
  {
    id: "electroswap",
    name: "ElectroSwap",
    buildUrl: getElectroSwapAssetUrl,
  },
  {
    id: "rarible",
    name: "Rarible",
    buildUrl: getRaribleItemUrl,
  },
] as const;

function buildMarketplaces(collection: string, tokenId: string | number) {
  return MARKETPLACES.map((market) => ({
    id: market.id,
    name: market.name,
    url: market.buildUrl(collection, tokenId),
  }));
}

function openExternalUrl(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) {
    try {
      opened.focus();
    } catch {
      // ignore focus errors
    }
    return true;
  }
  return false;
}

/**
 * Props:
 * - collection: contract address (string)
 * - tokenId: token number (string | number)
 * - open: whether to show modal
 * - onClose: callback
 */
export function MarketBrowserRefined({
  collection,
  tokenId,
  open,
  onClose,
}: {
  collection: string;
  tokenId: string | number;
  open: boolean;
  onClose: () => void;
}) {
  const markets = useMemo(() => buildMarketplaces(collection, tokenId), [collection, tokenId]);

  function handleSelect(url: string, name: string) {
    const opened = openExternalUrl(url);
    if (opened) {
      onClose();
      return;
    }

    toast.error(`Popup blocked. Allow popups for this site, or open ${name} manually.`);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1400,
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={() => onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(500px, 94vw)",
          maxWidth: "500px",
          height: "auto",
          background: "#0b1220",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
            View NFT in Marketplace
          </div>
          <div style={{ color: "#9aa4b2", fontSize: 13 }}>
            Opens the on-chain token page for this contract and token ID.
          </div>

          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
            {markets.map((market) => (
              <button
                key={market.id}
                onClick={() => handleSelect(market.url, market.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "#081020",
                  color: "#e6eef8",
                  border: "1px solid rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{market.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9aa4b2",
                      marginTop: 4,
                      wordBreak: "break-all",
                    }}
                  >
                    {market.url}
                  </div>
                </div>

                <span style={{ fontSize: 13, color: "#9fffba", minWidth: 72, textAlign: "right" }}>
                  Open
                </span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={() => onClose()}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#18202a",
                color: "#cbd6e3",
                border: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
