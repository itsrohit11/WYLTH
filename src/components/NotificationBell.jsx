import { useEffect, useState, useRef } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { formatCurrency, MONTHS } from '../lib/utils'
import toast from 'react-hot-toast'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [navIn, setNavIn] = useState({})   // investment_id -> { nav, units }
  const ref = useRef(null)

  const load = () => { window.api.notification.pending().then(setItems).catch(() => setItems([])) }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const accept = async (n) => { await window.api.notification.accept(n.investment_id, n.month, n.year); load() }
  const skip = async (n) => { await window.api.notification.skip(n.investment_id, n.month, n.year); load() }
  const remindLater = async (n) => { await window.api.notification.remindLater(n.investment_id); load() }
  const ack = async (n) => { await window.api.notification.ackReminder(n.kind, n.ref_id, n.period); load() }
  const payBill = async (n) => {
    const r = await window.api.notification.payBill(n.kind, n.ref_id, n.period)
    if (r?.debited > 0) toast.success(`${formatCurrency(r.debited)} paid and taken out of your Expense account`)
    load()
  }
  // The X on every notification: hide it without acting on it. Card bills and SIP debits come
  // back tomorrow if still unresolved; monthly bills return next month; one-off items stay gone.
  const dismiss = async (n) => {
    try {
      if (n.kind === 'SIP') await window.api.notification.remindLater(n.investment_id)
      else if (n.kind === 'CONTRIBUTION') await window.api.notification.skip(n.investment_id, n.month, n.year)
      else if (n.kind === 'SIP_NAV') await window.api.notification.ackReminder('SIP_NAV', n.investment_id, n.ym)
      else await window.api.notification.ackReminder(n.kind, n.ref_id, n.period)
    } catch {}
    load()
  }
  const setNav = (id, k, v) => setNavIn(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }))
  const saveNav = async (n) => {
    const v = navIn[n.investment_id] || {}
    if (!(Number(v.nav) > 0) || !(Number(v.units) > 0)) return
    await window.api.investment.saveNav({ investment_id: n.investment_id, ym: n.ym, nav: Number(v.nav), units: Number(v.units) })
    setNavIn(p => { const c = { ...p }; delete c[n.investment_id]; return c })
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-lg text-muted hover:bg-surface-2 hover:text-content transition-colors">
        <Bell size={19} />
        {items.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">{items.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-surface rounded-xl shadow-lift ring-1 ring-slate-900/5 border border-line z-50 overflow-hidden animate-scale-in">
          <div className="px-4 py-3 border-b border-line"><p className="text-sm font-semibold text-content">Notifications</p></div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-faint text-center">No pending notifications</p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-line">
              {items.map(n => (
                <div key={n.ref_id ? `${n.kind}-${n.ref_id}-${n.period}` : `${n.kind}-${n.investment_id}-${n.month}-${n.year}`} className="relative pl-4 pr-9 py-3">
                  <button onClick={() => dismiss(n)} title="Dismiss" aria-label="Dismiss notification"
                    className="absolute top-2.5 right-2.5 p-1 rounded-full text-faint hover:text-content hover:bg-surface-2 transition-colors"><X size={14} /></button>
                  {n.kind === 'SIP' ? (
                    <>
                      <p className="text-sm text-content">SIP due on the {n.day}<sup>{n.day % 10 === 1 && n.day !== 11 ? 'st' : n.day % 10 === 2 && n.day !== 12 ? 'nd' : n.day % 10 === 3 && n.day !== 13 ? 'rd' : 'th'}</sup>: <b>{n.title}</b> — <b>{formatCurrency(n.amount)}</b>.</p>
                      <p className="text-xs text-faint mt-0.5">Debited from your savings for {MONTHS[n.month - 1]}?</p>
                      <div className="mt-2 flex gap-3 items-center">
                        <button onClick={() => accept(n)} className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg flex items-center gap-1 hover:bg-green-200"><Check size={12} /> Yes, debited</button>
                        <button onClick={() => remindLater(n)} className="text-xs font-medium text-muted hover:text-content">Not yet</button>
                      </div>
                    </>
                  ) : n.kind === 'SIP_NAV' ? (
                    <>
                      <p className="text-sm text-content">Update <b>{n.title}</b> — enter today's <b>NAV</b> and your total <b>units</b> for {MONTHS[n.month - 1]} to refresh your P&amp;L.</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input type="number" step="any" placeholder="NAV ₹" value={navIn[n.investment_id]?.nav || ''} onChange={e => setNav(n.investment_id, 'nav', e.target.value)} className="w-24 px-2 py-1 text-xs border border-line rounded-md bg-surface text-content focus:outline-none focus:border-brand-500"/>
                        <input type="number" step="any" placeholder="Units" value={navIn[n.investment_id]?.units || ''} onChange={e => setNav(n.investment_id, 'units', e.target.value)} className="w-24 px-2 py-1 text-xs border border-line rounded-md bg-surface text-content focus:outline-none focus:border-brand-500"/>
                        <button onClick={() => saveNav(n)} className="text-xs font-semibold text-white bg-brand-600 px-2.5 py-1 rounded-lg hover:bg-brand-500">Save</button>
                      </div>
                    </>
                  ) : n.kind === 'CONTRIBUTION' ? (
                    <>
                      <p className="text-sm text-content">Add <b>{formatCurrency(n.amount)}</b> to <b>{n.title}</b> for {MONTHS[n.month - 1]}?</p>
                      <div className="mt-2 flex gap-3 items-center">
                        <button onClick={() => accept(n)} className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg flex items-center gap-1 hover:bg-green-200"><Check size={12} /> Accept</button>
                        <button onClick={() => skip(n)} className="text-xs font-medium text-muted hover:text-content">Skip</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-content">{n.kind === 'BILL' ? 'Bill due' : n.kind === 'CARD' ? 'Credit card bill due' : 'Recurring payment due'}: <b>{n.title}</b> — {formatCurrency(n.amount)}{n.note ? ` · ${n.note}` : ''}</p>
                      <p className={`text-xs mt-0.5 ${n.kind === 'CARD' && n.daysToDue < 0 ? 'text-red-600 font-semibold' : 'text-faint'}`}>{n.kind === 'BILL' ? `Due ${n.date}` : n.kind === 'CARD' ? (n.daysToDue < 0 ? `Overdue by ${-n.daysToDue} day${n.daysToDue === -1 ? '' : 's'} (was due ${n.dueDate})` : n.daysToDue === 0 ? `Due today (${n.dueDate})` : `Due in ${n.daysToDue} day${n.daysToDue === 1 ? '' : 's'} (${n.dueDate})`) : `Due day ${n.day} each month`}</p>
                      <div className="mt-2 flex gap-3 items-center">
                        {(n.kind === 'BILL' || n.kind === 'RECURRING') && (
                          <button onClick={() => payBill(n)} className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg flex items-center gap-1 hover:bg-green-200"><Check size={12} /> Paid — debit account</button>
                        )}
                        <button onClick={() => ack(n)} className="text-xs font-medium text-brand-600 hover:underline">{n.kind === 'BILL' || n.kind === 'RECURRING' ? 'Already recorded' : n.kind === 'CARD' ? 'Remind me tomorrow' : 'Got it'}</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
