import { cn } from '../../lib/utils'

const variants = {
  default:   'bg-gradient-to-r from-[#4F7FF5] via-[#6B73FF] to-[#8B6CFF] text-white hover:brightness-110 active:brightness-95 border border-transparent shadow-[0_8px_22px_-10px_rgb(91_110_255/0.8)]',
  secondary: 'bg-surface text-content border border-line hover:bg-surface-2 hover:border-[#223566]',
  outline:   'border border-line text-content bg-transparent hover:bg-surface-2',
  ghost:     'text-muted hover:bg-surface-2 hover:text-content',
  danger:    'bg-[#EF4444] text-white hover:bg-[#dc2626] active:brightness-95',
  success:   'bg-[#45B58A] text-[#060B18] font-semibold hover:bg-[#5cc79d] active:brightness-95',
}
const sizes = {
  default: 'px-5 py-2 text-sm',
  sm:      'px-3 py-1.5 text-xs',
  lg:      'px-6 py-3 text-base',
  icon:    'p-2 !rounded-xl',
}

export function Button({ className, variant='default', size='default', loading, children, disabled, ...p }) {
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-all duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B8CFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--app))] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...p}>
      {loading ? <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"/> : children}
    </button>
  )
}
