import { cn } from '../../lib/utils'

const base = 'w-full px-3.5 py-2.5 text-sm text-content border border-line rounded-xl bg-surface-2/70 placeholder-faint transition-all duration-150 hover:border-brand-400/50 focus:outline-none focus:border-brand-400 focus:shadow-focus'

export function Input({ label, className, ...p }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-muted mb-1">{label}</label>}
      <input className={cn(base, className)} {...p}/>
    </div>
  )
}

export function Select({ label, className, children, ...p }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-muted mb-1">{label}</label>}
      <select className={cn(base, 'appearance-none bg-no-repeat pr-9 cursor-pointer', className)}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundPosition: 'right 0.6rem center' }}
        {...p}>{children}</select>
    </div>
  )
}

export function Textarea({ label, className, ...p }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-muted mb-1">{label}</label>}
      <textarea className={cn(base, 'resize-none', className)} {...p}/>
    </div>
  )
}
