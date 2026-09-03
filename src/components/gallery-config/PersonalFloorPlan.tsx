import React from 'react'
import { Label } from '@/components/ui/label'
import WallButton from './WallButton'

interface PersonalFloorPlanProps {
  roomId: string
  selectedPanelKey: string
  setSelectedPanelKey: (key: string) => void
  getFriendlyLabel: (key: string) => string
}

const PersonalFloorPlan: React.FC<PersonalFloorPlanProps> = ({
  roomId,
  selectedPanelKey,
  setSelectedPanelKey,
  getFriendlyLabel,
}) => {
  const northKeys = [0, 1, 2].map((i) => `r:${roomId}:north-wall-${i}`)
  const southKeys = [0, 1, 2].map((i) => `r:${roomId}:south-wall-${i}`)
  const westKeys = [0, 1].map((i) => `r:${roomId}:west-wall-${i}`)
  const eastKeys = [0, 1].map((i) => `r:${roomId}:east-wall-${i}`)

  return (
    <div className="rounded-xl border bg-slate-950 p-4 space-y-4">
      <Label className="text-white text-xs font-bold uppercase tracking-wider">Your Room Layout</Label>
      <div className="relative flex w-full justify-center overflow-hidden rounded-lg border border-white/5 bg-slate-900">
        <div className="relative aspect-[3/2] w-full max-w-md p-10">
          <div className="relative h-full w-full rounded-lg border border-dashed border-cyan-500/30 bg-slate-950/80">
            <div className="absolute inset-[28%] rounded-md border border-white/10 bg-slate-900/60 flex items-center justify-center text-[10px] text-slate-500 uppercase tracking-widest">
              Lounge
            </div>

            <div className="absolute -top-8 left-0 right-0 flex h-8 gap-1">
              {northKeys.map((key) => (
                <WallButton
                  key={key}
                  panelKey={key}
                  isSelected={selectedPanelKey === key}
                  isLocked={false}
                  isLockedByMe={false}
                  label={getFriendlyLabel(key)}
                  onClick={setSelectedPanelKey}
                  className="flex-1"
                />
              ))}
            </div>

            <div className="absolute -bottom-8 left-0 right-0 flex h-8 gap-1">
              {southKeys.map((key) => (
                <WallButton
                  key={key}
                  panelKey={key}
                  isSelected={selectedPanelKey === key}
                  isLocked={false}
                  isLockedByMe={false}
                  label={getFriendlyLabel(key)}
                  onClick={setSelectedPanelKey}
                  className="flex-1"
                />
              ))}
            </div>

            <div className="absolute -left-8 top-0 bottom-0 flex w-8 flex-col gap-1">
              {westKeys.map((key) => (
                <WallButton
                  key={key}
                  panelKey={key}
                  isSelected={selectedPanelKey === key}
                  isLocked={false}
                  isLockedByMe={false}
                  label={getFriendlyLabel(key)}
                  onClick={setSelectedPanelKey}
                  className="flex-1"
                />
              ))}
            </div>

            <div className="absolute -right-8 top-0 bottom-0 flex w-8 flex-col gap-1">
              {eastKeys.map((key) => (
                <WallButton
                  key={key}
                  panelKey={key}
                  isSelected={selectedPanelKey === key}
                  isLocked={false}
                  isLockedByMe={false}
                  label={getFriendlyLabel(key)}
                  onClick={setSelectedPanelKey}
                  className="flex-1"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PersonalFloorPlan
