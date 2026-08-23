import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WalletApprovalStep = {
  label: string
  done?: boolean
  active?: boolean
}

type OperationLockOverlayProps = {
  open: boolean
  title: string
  description: string
  currentStep: string
  /** 0–100 for determinate progress; omit for indeterminate */
  progress?: number | null
  warning?: string
  walletSteps?: WalletApprovalStep[]
}

export function OperationLockOverlay({
  open,
  title,
  description,
  currentStep,
  progress = null,
  warning = 'Please keep this tab open and do not click Back or leave the page until this finishes. Large collections can take several minutes.',
  walletSteps,
}: OperationLockOverlayProps) {
  if (!open) return null

  const determinate = progress != null
  const clampedProgress = determinate ? Math.min(100, Math.max(0, progress)) : 0

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="operation-lock-title"
      aria-describedby="operation-lock-description"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-400" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 id="operation-lock-title" className="text-lg font-semibold text-white">
                {title}
              </h2>
              <p id="operation-lock-description" className="mt-1 text-sm leading-relaxed text-slate-400">
                {description}
              </p>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {warning}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-200">{currentStep}</p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                {determinate ? (
                  <div
                    className="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out"
                    style={{ width: `${clampedProgress}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-[operation-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-blue-500" />
                )}
              </div>
              {determinate && (
                <p className="text-xs tabular-nums text-slate-500">{Math.round(clampedProgress)}%</p>
              )}
            </div>

            {walletSteps && walletSteps.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Wallet approvals</p>
                <ul className="mt-2 space-y-2">
                  {walletSteps.map((step) => (
                    <li
                      key={step.label}
                      className={cn(
                        'flex items-start gap-2 text-sm',
                        step.done ? 'text-emerald-400' : step.active ? 'text-white' : 'text-slate-500',
                      )}
                    >
                      <span className="mt-0.5 shrink-0" aria-hidden>
                        {step.done ? '✓' : step.active ? '→' : '○'}
                      </span>
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
