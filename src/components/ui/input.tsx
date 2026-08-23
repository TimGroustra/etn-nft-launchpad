import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-slate-300', className)} {...props} />
}
