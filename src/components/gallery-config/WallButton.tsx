import React from 'react'
import { cn } from '@/lib/utils'

interface WallButtonProps {
  panelKey: string
  isSelected: boolean
  isLocked: boolean
  isLockedByMe: boolean
  label: string
  orientation?: 'horizontal' | 'vertical'
  onClick: (key: string) => void
  className?: string
}

const WallButton: React.FC<WallButtonProps> = ({
  panelKey,
  isSelected,
  isLocked,
  isLockedByMe,
  label,
  orientation = 'horizontal',
  onClick,
  className,
}) => {
  return (
    <button
      type="button"
      onClick={() => onClick(panelKey)}
      title={label}
      className={cn(
        'group relative flex items-center justify-center p-1 transition-all touch-manipulation',
        orientation === 'horizontal' ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      <div
        className={cn(
          'rounded-full transition-all',
          orientation === 'horizontal' ? 'h-[3px] w-full' : 'h-full w-[3px]',
          isSelected
            ? 'scale-y-125 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
            : isLocked && !isLockedByMe
              ? 'bg-red-500/60'
              : 'bg-slate-700 group-hover:bg-slate-500',
        )}
      />
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 rounded-sm border border-cyan-400/30" />
      )}
    </button>
  )
}

export default WallButton
