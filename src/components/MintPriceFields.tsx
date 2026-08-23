import { useEffect, useState } from 'react'
import { Input, Label } from '@/components/ui/input'
import { FieldError, FieldHint } from '@/components/form-fields'
import { EtnUsdHint } from '@/components/EtnUsdHint'
import { formatEtnFromUsdInput } from '@/lib/etn-usd-rate'
import { useEtnUsdRate } from '@/hooks/useEtnUsdRate'

type MintPriceFieldsProps = {
  etnValue: string
  onEtnChange: (value: string) => void
  minEtn: number
  etnError?: string | null
}

export function MintPriceFields({ etnValue, onEtnChange, minEtn, etnError }: MintPriceFieldsProps) {
  const { data: usdPerEtn } = useEtnUsdRate()
  const [usdValue, setUsdValue] = useState('')
  const [lastEdited, setLastEdited] = useState<'etn' | 'usd'>('etn')

  useEffect(() => {
    if (lastEdited !== 'etn' || !usdPerEtn) return
    const etn = Number(etnValue)
    if (!Number.isFinite(etn) || etn <= 0) {
      setUsdValue('')
      return
    }
    const usd = etn * usdPerEtn
    setUsdValue(String(Math.round(usd * 10000) / 10000))
  }, [etnValue, usdPerEtn, lastEdited])

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="mint-price-etn">Mint price (ETN)</Label>
        <Input
          id="mint-price-etn"
          type="number"
          min={minEtn}
          step="0.0001"
          value={etnValue}
          onChange={(e) => {
            setLastEdited('etn')
            onEtnChange(e.target.value)
          }}
        />
        <EtnUsdHint etn={etnValue} className="mt-1.5" />
        <FieldHint>Minimum {minEtn} ETN per NFT on supported marketplaces.</FieldHint>
        <FieldError message={etnError} />
      </div>

      <div>
        <Label htmlFor="mint-price-usd">Or set price in USD</Label>
        <Input
          id="mint-price-usd"
          type="number"
          min={0}
          step="0.01"
          value={usdValue}
          disabled={!usdPerEtn}
          placeholder={usdPerEtn ? '0.00' : 'Loading rate…'}
          onChange={(e) => {
            const raw = e.target.value
            setLastEdited('usd')
            setUsdValue(raw)
            if (!usdPerEtn) return
            const usd = Number(raw)
            if (!Number.isFinite(usd) || usd <= 0) return
            onEtnChange(formatEtnFromUsdInput(usd, usdPerEtn, minEtn))
          }}
        />
        <FieldHint>ETN amount updates automatically from the live USD rate.</FieldHint>
      </div>
    </div>
  )
}
