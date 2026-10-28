import { cn } from '../../lib/utils'

const colors = {
  blue:   'bg-gradient-to-r from-[#4F7FF5] to-[#22D3EE]',
  green:  'bg-gradient-to-r from-[#2C9A6E] to-[#5FD3A3]',
  orange: 'bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]',
  red:    'bg-gradient-to-r from-[#EF4444] to-[#F87171]',
  yellow: 'bg-[#F59E0B]',
  purple: 'bg-gradient-to-r from-[#A78BFA] to-[#D6B875]',
}
const sizes = { default:'h-1.5', lg:'h-2.5' }

export function ProgressBar({ value=0, max=100, color='blue', showLabel=false, size='default', className }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return (
    <div>
      <div className={cn('w-full bg-surface-2 rounded-full overflow-hidden', sizes[size], className)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500 ease-out', colors[color]||colors.blue)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <p className="text-right text-xs text-faint mt-0.5 tabular">{pct.toFixed(0)}%</p>}
    </div>
  )
}
