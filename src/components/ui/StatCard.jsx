import { Card, CardContent } from './Card'
import { cn } from '../../lib/utils'

const iconColors = {
  blue:   'bg-brand-50 text-brand-600 ring-brand-100',
  green:  'bg-emerald-50 text-emerald-600 ring-emerald-100',
  orange: 'bg-amber-50 text-amber-600 ring-amber-100',
  red:    'bg-red-50 text-red-600 ring-red-100',
  purple: 'bg-violet-50 text-violet-600 ring-violet-100',
}

const dotText = { blue:'text-brand-400', green:'text-mint-500', orange:'text-[#F59E0B]', red:'text-coral-500', purple:'text-[#9AA8C7]' }

export function StatCard({ title, value, subtitle, icon: Icon, color='blue', className }) {
  return (
    <Card className={cn('transition-all duration-200 hover:-translate-y-0.5', className)}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-medium text-muted">{title}</p>
          {Icon && <Icon size={16} className={cn(dotText[color]||dotText.blue)}/>}
        </div>
        <p className="text-[30px] font-semibold text-content leading-none tabular">{value}</p>
        {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}
