import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { CalendarDays, Sun, Moon, Search, Settings } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import SettingsModal from '../SettingsModal'
import { useTheme } from '../../lib/theme'
import { UpdatedAt } from '../ui/UpdatedAt'

// Which parts of the app each page's "last updated" should look at.
const SECTION_OF = {
  '/dashboard': ['all'], '/analytics': ['all'], '/export': ['all'], '/notes': ['notes'],
  '/salary': ['salary'], '/expenses': ['expenses'], '/monthly-spending': ['expenses'],
  '/recurring': ['recurring'], '/cards': ['cards'], '/savings': ['savings', 'bank'],
  '/investments': ['investments'], '/emergency-fund': ['emergency'], '/bank': ['bank'], '/loans': ['loans'],
}

const titles = {
  '/dashboard':         'Dashboard',
  '/salary':            'Salary Allocations',
  '/expenses':          'Expenses',
  '/monthly-spending':  'Monthly Spending',
  '/recurring':         'Recurring Expenses',
  '/savings':           'Savings Goals',
  '/investments':       'Investments',
  '/emergency-fund':    'Emergency Fund',
  '/bank':              'Bank Accounts',
  '/cards':             'Credit Cards',
  '/bills':             'Bills',
  '/loans':             'Lending & Debts',
  '/analytics':         'Analytics',
  '/export':            'Export & Backup',
  '/notes':             'Notes',
}

export default function Header() {
  const loc = useLocation()
  const title = titles[loc.pathname] || 'WYLTH'
  const { theme, toggle } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [stamps, setStamps] = useState(null)
  // Refresh when you change page, every 20s, and whenever the window regains focus.
  useEffect(() => {
    const load = () => window.api.meta.lastUpdated().then(setStamps).catch(() => {})
    load()
    const t = setInterval(load, 20000)
    window.addEventListener('focus', load); window.addEventListener('data-saved', load)
    return () => { clearInterval(t); window.removeEventListener('focus', load); window.removeEventListener('data-saved', load) }
  }, [loc.pathname])
  const pageStamp = stamps && (SECTION_OF[loc.pathname] || []).map(k => stamps[k]).filter(Boolean).sort().pop()
  return (
    <header className="sticky top-0 z-20 px-8 py-4 flex items-center justify-between flex-shrink-0 bg-gradient-to-b from-[rgb(var(--app))] via-[rgb(var(--app))]/80 to-transparent backdrop-blur-sm">
      <div className="flex items-baseline gap-3 min-w-0">
        {loc.pathname === '/dashboard' ? <h1 className="font-display text-xl font-bold text-content tracking-tight">{title}</h1> : <h1 className="sr-only">{title}</h1>}
        <UpdatedAt at={pageStamp} label="Last updated" />
      </div>
      <div className="flex items-center gap-2.5">
        <button onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          className="hidden md:inline-flex items-center gap-2 text-xs font-medium text-muted bg-surface-2/70 border border-line hover:border-brand-400/60 rounded-full pl-3 pr-2 py-2 transition-colors">
          <Search size={13} className="text-faint"/>
          <span>Search…</span>
          <kbd className="text-[10px] font-semibold bg-surface border border-line rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>
        
        <button onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          className="p-2.5 rounded-full text-muted hover:bg-surface-2 hover:text-content transition-colors">
          {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Spending alerts"
          className="p-2.5 rounded-full text-muted hover:bg-surface-2 hover:text-content transition-colors">
          <Settings size={18}/>
        </button>
        <NotificationBell />
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => window.dispatchEvent(new Event('settings-changed'))}/>
    </header>
  )
}
