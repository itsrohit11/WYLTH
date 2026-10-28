import { cn } from '../../lib/utils'

export function Card({ className, children, ...p }) {
  return <div className={cn('card-surface shadow-card transition-all duration-200 hover:shadow-lift', className)} {...p}>{children}</div>
}
export function CardHeader({ className, children, ...p }) {
  return <div className={cn('px-6 pt-6 pb-3', className)} {...p}>{children}</div>
}
export function CardTitle({ className, children, ...p }) {
  return <h3 className={cn('text-base font-semibold text-content tracking-tight', className)} {...p}>{children}</h3>
}
export function CardContent({ className, children, ...p }) {
  return <div className={cn('px-6 pb-6', className)} {...p}>{children}</div>
}
