import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Wallet, Receipt, CalendarDays, Repeat, PiggyBank, TrendingUp,
  Landmark, CreditCard, Shield, Coins, BarChart3, Download, Sun, Moon, Search, CornerDownLeft,
} from 'lucide-react'
import { useTheme } from '../lib/theme'

const NAV = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Salary', to: '/salary', icon: Wallet },
  { label: 'Expenses', to: '/expenses', icon: Receipt },
  { label: 'Monthly Spending', to: '/monthly-spending', icon: CalendarDays },
  { label: 'Recurring & Bills', to: '/recurring', icon: Repeat },
  { label: 'Savings', to: '/savings', icon: PiggyBank },
  { label: 'Investments', to: '/investments', icon: TrendingUp },
  { label: 'Bank Accounts', to: '/bank', icon: Landmark },
  { label: 'Credit Cards', to: '/cards', icon: CreditCard },
  { label: 'Emergency Fund', to: '/emergency-fund', icon: Shield },
  { label: 'Lending & Debts', to: '/loans', icon: Coins },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Export & Backup', to: '/export', icon: Download },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()

  // Global Ctrl/Cmd+K to toggle.
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(o => !o) }
      else if (e.key === 'Escape') setOpen(false)
    }
    const openEvt = () => setOpen(true)
    window.addEventListener('keydown', h)
    window.addEventListener('open-command-palette', openEvt)
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('open-command-palette', openEvt) }
  }, [])

  useEffect(() => { if (open) { setQuery(''); setIndex(0); setTimeout(() => inputRef.current?.focus(), 20) } }, [open])

  const commands = useMemo(() => ([
    ...NAV.map(n => ({ ...n, group: 'Go to', run: () => navigate(n.to) })),
    { label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? Sun : Moon, group: 'Action', run: toggle },
  ]), [navigate, theme, toggle])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? commands.filter(c => c.label.toLowerCase().includes(q)) : commands
  }, [commands, query])

  const run = (cmd) => { if (!cmd) return; setOpen(false); cmd.run() }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => (i + 1) % Math.max(filtered.length, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => (i - 1 + filtered.length) % Math.max(filtered.length, 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-overlay-in" onClick={() => setOpen(false)}/>
      <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-lift ring-1 ring-slate-900/10 overflow-hidden animate-scale-in">
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Search size={17} className="text-faint shrink-0"/>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            className="w-full py-3.5 bg-transparent text-sm text-content placeholder-faint focus:outline-none"/>
          <kbd className="text-[10px] font-medium text-faint border border-line rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-faint text-center">No matches</p>
          ) : filtered.map((c, i) => {
            const Icon = c.icon
            return (
              <button key={c.label} onMouseEnter={() => setIndex(i)} onClick={() => run(c)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === index ? 'bg-brand-50 text-brand-700' : 'text-content hover:bg-surface-2'}`}>
                {Icon && <Icon size={16} className={i === index ? 'text-brand-600' : 'text-faint'}/>}
                <span className="flex-1">{c.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-faint">{c.group}</span>
                {i === index && <CornerDownLeft size={13} className="text-brand-500"/>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
