import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NftAttribute } from '@/lib/nft-metadata'

type TokenAttributesEditorProps = {
  attributes: NftAttribute[]
  onChange: (attributes: NftAttribute[]) => void
  error?: string | null
}

const EMPTY_ATTR: NftAttribute = { trait_type: '', value: '' }

export function TokenAttributesEditor({ attributes, onChange, error }: TokenAttributesEditorProps) {
  const updateAt = (index: number, patch: Partial<NftAttribute>) => {
    const next = attributes.map((attr, i) => (i === index ? { ...attr, ...patch } : attr))
    onChange(next)
  }

  const removeAt = (index: number) => {
    onChange(attributes.filter((_, i) => i !== index))
  }

  const addRow = () => {
    onChange([...attributes, { ...EMPTY_ATTR }])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-300">Attributes (optional)</p>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          Add trait
        </Button>
      </div>

      {attributes.length === 0 ? (
        <p className="text-xs text-slate-500">No traits yet. Add attributes for marketplace filters and display.</p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attr, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={attr.trait_type}
                onChange={(e) => updateAt(index, { trait_type: e.target.value })}
                placeholder="Trait (e.g. Background)"
              />
              <Input
                value={String(attr.value)}
                onChange={(e) => updateAt(index, { value: e.target.value })}
                placeholder="Value (e.g. Blue)"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => removeAt(index)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
