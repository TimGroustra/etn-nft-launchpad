import { Lock, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { panelKeysForFloor, panelSectionLabel, type OuterFloor } from './panelKeys'

interface PanelPickerListProps {
  outerFloor: OuterFloor
  setOuterFloor: (floor: OuterFloor) => void
  selectedPanelKey: string
  onSelectPanel: (key: string) => void
  getLockStatus: (key: string) => { isLocked: boolean; isLockedByMe: boolean }
  getFriendlyLabel: (key: string) => string
}

export default function PanelPickerList({
  outerFloor,
  setOuterFloor,
  selectedPanelKey,
  onSelectPanel,
  getLockStatus,
  getFriendlyLabel,
}: PanelPickerListProps) {
  const keys = panelKeysForFloor(outerFloor)

  const sections = keys.reduce<Record<string, string[]>>((acc, key) => {
    const section = panelSectionLabel(key)
    if (!acc[section]) acc[section] = []
    acc[section].push(key)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-bold uppercase tracking-wider text-white">
          Choose a panel
        </Label>
        <div className="flex shrink-0 gap-1 rounded-full bg-white/10 p-0.5">
          {(['ground', 'first'] as OuterFloor[]).map((floor) => (
            <button
              key={floor}
              type="button"
              onClick={() => setOuterFloor(floor)}
              className={cn(
                'min-h-9 rounded-full px-3 text-[11px] font-bold transition-colors touch-manipulation',
                outerFloor === floor
                  ? 'bg-cyan-500 text-black'
                  : 'text-slate-400 active:bg-white/10',
              )}
            >
              {floor === 'ground' ? 'Ground' : 'First'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[min(60vh,520px)] space-y-4 overflow-y-auto overscroll-contain pr-1">
        {Object.entries(sections).map(([section, sectionKeys]) => (
          <div key={section} className="space-y-2">
            <p className="sticky top-0 z-10 bg-slate-950/95 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {section}
            </p>
            <div className="grid gap-2">
              {sectionKeys.map((key) => {
                const lock = getLockStatus(key)
                const selected = selectedPanelKey === key
                const lockedByOther = lock.isLocked && !lock.isLockedByMe

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectPanel(key)}
                    disabled={lockedByOther}
                    className={cn(
                      'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors touch-manipulation',
                      selected
                        ? 'border-cyan-400/60 bg-cyan-500/10'
                        : 'border-white/10 bg-slate-900 active:bg-slate-800',
                      lockedByOther && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span className="text-sm font-medium leading-snug">
                      {getFriendlyLabel(key)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {lock.isLocked && (
                        <Lock
                          className={cn(
                            'h-4 w-4',
                            lock.isLockedByMe ? 'text-amber-400' : 'text-red-400',
                          )}
                        />
                      )}
                      {selected && <Check className="h-4 w-4 text-cyan-400" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
