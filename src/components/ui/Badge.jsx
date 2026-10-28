import { cn } from '../../lib/utils'

const variants = {
  default: 'bg-surface-2 text-muted ring-line',
  info:    'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  danger:  'bg-red-50 text-red-700 ring-red-100',
  purple:  'bg-violet-50 text-violet-700 ring-violet-100',
}

export function Badge({ className, variant='default', children }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ', variants[variant]||variants.default, className)}>
      {children}
    </span>
  )
}
