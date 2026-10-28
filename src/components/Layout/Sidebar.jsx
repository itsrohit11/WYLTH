import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, Receipt, CalendarDays, Repeat, PiggyBank, TrendingUp, Shield, Landmark, CreditCard, Coins, BarChart3, Download, IndianRupee, StickyNote } from 'lucide-react'
import { cn } from '../../lib/utils'

// Grouped, workflow-based order (income -> spending -> wealth -> tools).
const groups = [
  { label: null, items: [
    { to:'/dashboard', icon: LayoutDashboard, label:'Dashboard' },
  ]},
  { label: 'Income & Spending', items: [
    { to:'/salary',           icon: Wallet,       label:'Salary' },
    { to:'/expenses',         icon: Receipt,      label:'Expenses' },
    { to:'/monthly-spending', icon: CalendarDays, label:'Monthly Spending' },
    { to:'/recurring',        icon: Repeat,       label:'Recurring & Bills' },
    { to:'/cards',            icon: CreditCard,   label:'Credit Cards' },
  ]},
  { label: 'Wealth', items: [
    { to:'/savings',        icon: PiggyBank,  label:'Savings' },
    { to:'/investments',    icon: TrendingUp, label:'Investments' },
    { to:'/bank',           icon: Landmark,   label:'Bank Accounts' },
    { to:'/emergency-fund', icon: Shield,     label:'Emergency Fund' },
  ]},
  { label: 'More', items: [
    { to:'/loans',     icon: Coins,     label:'Lending & Debts' },
    { to:'/notes',     icon: StickyNote, label:'Notes' },
    { to:'/analytics', icon: BarChart3, label:'Analytics' },
    { to:'/export',    icon: Download,  label:'Export' },
  ]},
]

// A slim icon rail that opens on hover: the whole app gets the width, and the labels appear
// only when you reach for them. It overlays the page instead of pushing it.
export default function Sidebar() {
  return (
    <aside className="group/rail relative w-[84px] shrink-0 h-screen z-30">
      <div className="absolute inset-y-3 left-3 w-[60px] hover:w-[244px] focus-within:w-[244px] transition-[width] duration-300 ease-out overflow-hidden card-surface !rounded-[24px] flex flex-col shadow-card hover:shadow-lift hover:!border-line">
        <div className="px-[10px] pt-4 pb-3 flex items-center gap-3 shrink-0">
          <span className="w-10 h-10 rounded-2xl sig-fill flex items-center justify-center shrink-0">
            <IndianRupee size={19} strokeWidth={2.75} className="text-white"/>
          </span>
          <div className="whitespace-nowrap opacity-0 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 transition-opacity duration-200">
            <p className="font-logo logo-grad text-[17px] leading-tight">WYLTH</p>
            <p className="text-faint text-[11px]">Grow quietly</p>
          </div>
        </div>

        <nav className="rail-scroll flex-1 min-h-0 px-[10px] pb-2 overflow-y-auto overflow-x-hidden overscroll-contain">
          {groups.map((g, gi) => (
            <div key={gi} className={gi === 0 ? '' : 'mt-2'}>
              {gi > 0 && <div className="mx-2 mb-2 border-t border-line/60"/>}
              {g.label && <p className="px-2 pb-1 text-[11px] font-semibold text-faint whitespace-nowrap h-0 group-hover/rail:h-5 overflow-hidden opacity-0 group-hover/rail:opacity-100 transition-all duration-200">{g.label}</p>}
              <div className="space-y-0.5">
                {g.items.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to} title={label} className={({ isActive }) => cn(
                    'group relative flex items-center gap-3 rounded-2xl text-[14px] font-medium transition-colors duration-150 h-10',
                    isActive ? 'text-content' : 'text-muted hover:text-content'
                  )}>
                    {({ isActive }) => (
                      <>
                        <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all',
                          isActive ? 'bg-gradient-to-br from-[#4F7FF5] to-[#8B6CFF] text-white dark:bg-none dark:bg-[#5B8CFF]/18 dark:text-[#8FB0FF] dark:ring-1 dark:ring-[#5B8CFF]/40' : 'text-faint group-hover:bg-surface-2 group-hover:text-content')}>
                          <Icon size={17}/>
                        </span>
                        <span className="whitespace-nowrap opacity-0 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 transition-opacity duration-200">{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-[10px] py-3 border-t border-line/60 flex items-center gap-3 shrink-0">
          <span className="w-10 h-10 rounded-2xl bg-surface-2 text-content font-display font-bold flex items-center justify-center shrink-0">R</span>
          <div className="whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-200">
            <p className="text-content text-sm font-semibold leading-tight">Rohit Jain</p>
            <p className="text-faint text-[11px]">Stored only on this PC</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
