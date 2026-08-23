import type { WalletApprovalStep } from '@/components/OperationLockOverlay'
import type { Collection } from '@/types/database'

export function buildPublishWalletSteps(collection: Collection, needsDeploy: boolean): WalletApprovalStep[] {
  const steps: WalletApprovalStep[] = []
  if (needsDeploy) {
    steps.push({ label: 'Pay publish fee & deploy collection contract' })
  }
  steps.push({ label: 'Set on-chain metadata base URI' })
  if (collection.mint_mode === 'batch') {
    const chunks = Math.ceil(collection.max_supply / 50)
    if (chunks === 1) {
      steps.push({ label: `Batch mint all ${collection.max_supply} tokens to your wallet` })
    } else {
      for (let i = 0; i < chunks; i++) {
        const start = i * 50 + 1
        const end = Math.min((i + 1) * 50, collection.max_supply)
        steps.push({ label: `Batch mint tokens ${start}–${end} of ${collection.max_supply}` })
      }
    }
  } else if (Number(collection.mint_price_etn ?? 0) > 0) {
    steps.push({ label: 'Set public mint price' })
    if (collection.random_public_mint) {
      steps.push({ label: 'Enable random mint order' })
    }
    steps.push({ label: 'Enable public minting' })
  }
  if (Number(collection.max_mint_per_wallet ?? 0) > 0 && collection.mint_mode !== 'batch') {
    steps.push({ label: 'Set per-wallet mint limit' })
  }
  steps.push({ label: 'Set marketplace royalty (EIP-2981)' })
  return steps
}

export function activateWalletStep(steps: WalletApprovalStep[], label: string): WalletApprovalStep[] {
  const index = steps.findIndex((step) => step.label === label)
  if (index === -1) return steps
  return steps.map((step, i) => ({
    ...step,
    done: i < index,
    active: i === index,
  }))
}

export function completeWalletSteps(steps: WalletApprovalStep[]): WalletApprovalStep[] {
  return steps.map((step) => ({ ...step, done: true, active: false }))
}

export function saveDraftProgress(completed: number, total: number, phase: 'validating' | 'creating' | 'uploading' | 'finishing'): {
  active: true
  step: string
  progress: number | null
} {
  if (phase === 'validating') {
    return { active: true, step: 'Validating images…', progress: 5 }
  }
  if (phase === 'creating') {
    return { active: true, step: 'Creating collection record…', progress: 12 }
  }
  if (phase === 'finishing') {
    return { active: true, step: 'Finishing up…', progress: 98 }
  }
  if (total <= 0) {
    return { active: true, step: 'Uploading artwork & metadata…', progress: null }
  }
  const ratio = completed / total
  return {
    active: true,
    step: `Uploading token ${completed} of ${total}…`,
    progress: 12 + ratio * 84,
  }
}
