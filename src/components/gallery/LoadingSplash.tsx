import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface LoadingSplashProps {
  progress: number
  message?: string
}

function DiamondVisual() {
  return (
    <div className="relative flex h-[150px] w-[150px] items-center justify-center">
      <div className="absolute h-28 w-28 animate-pulse rounded-full bg-cyan-500/10 blur-2xl" />
      <div
        className="relative h-16 w-16 animate-[spin_8s_linear_infinite]"
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="absolute inset-0 rotate-45 rounded-sm border border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.35)]" />
        <div className="absolute inset-2 rotate-[22.5deg] rounded-sm border border-fuchsia-400/50 bg-fuchsia-500/10" />
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
      </div>
    </div>
  )
}

export default function LoadingSplash({
  progress,
  message = 'Initializing Gallery...',
}: LoadingSplashProps) {
  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-[#050505] p-6 text-center">
      <div className="relative mb-4 flex items-center justify-center">
        <div className="absolute h-48 w-48 animate-pulse rounded-full bg-cyan-500/5 blur-[80px]" />
        <div className="relative z-10 opacity-80">
          <DiamondVisual />
        </div>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white/40">ETN 3D Gallery</h2>
        <div className="space-y-2">
          <Progress value={progress} className="h-1 bg-white/5 [&>div]:bg-white/30" />
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/30">
            <span>{message}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 flex items-center gap-2 text-xs font-medium text-white/30">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading Assets & Textures</span>
      </div>
    </div>
  )
}
