export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{children}</p>
}

export function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return <p className="mt-1.5 text-sm text-red-400">{message}</p>
}
