import { useEffect, useState } from 'react'
import { useExpenseStore } from '../stores/expenseStore'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, MONTHS, EXPENSE_CATEGORIES, PAYMENT_METHODS, catLabel } from '../lib/utils'
import { Plus, Pencil, Trash2, Receipt, Filter, ChevronRight, AlertTriangle, Wallet } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { UpdatedAt } from '../components/ui/UpdatedAt'

const CY = new Date().getFullYear()
const pad2 = (n) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
const parseLocal = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const fmtDay = (s) => format(parseLocal(s), 'EEE, dd MMM yyyy')

const payLabel = (m) => m === 'CARD' ? 'Card (Credit Card)' : m === 'BANK_TRANSFER' ? 'Bank Transfer' : m

function ExpenseForm({ initial, defaultDate, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    title:initial.title, amount:initial.amount, category:initial.category,
    category_name:initial.category_name||'', date:initial.date,
    payment_method:initial.payment_method||'UPI', is_recurring:!!initial.is_recurring, notes:initial.notes||'', card_id:'', account_id: initial.debit_account_id ? String(initial.debit_account_id) : '',
    split:false, splitMode:'equal', people:[]
  } : {
    title:'', amount:'', category:'WANT', category_name:'',
    date: defaultDate || todayStr(),
    payment_method:'UPI', is_recurring:false, notes:'', card_id:'', account_id:'',
    split:false, splitMode:'equal', people:[]
  })
  const [cards, setCards] = useState([])
  const [banks, setBanks] = useState([])
  useEffect(()=>{ window.api.card.getAll().then(setCards).catch(()=>setCards([])); window.api.bank.getAll().then(setBanks).catch(()=>setBanks([])) }, [])
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  // When Card is chosen, default to your first card so the spend always lands on a card.
  useEffect(()=>{ if(!initial && f.payment_method==='CARD' && cards.length && !f.card_id) s('card_id', String(cards[0].id)) }, [f.payment_method, cards])
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }

  // Split preview.
  const named = f.people.filter(p=>p.name && p.name.trim())
  const total = Number(f.amount)||0
  let othersTotal = 0, yourShare = total, eachEqual = 0
  if (f.split && named.length) {
    if (f.splitMode==='custom') { othersTotal = named.reduce((sm,p)=>sm+(Number(p.amount)||0),0); yourShare = total - othersTotal }
    else { eachEqual = total/(named.length+1); othersTotal = eachEqual*named.length; yourShare = total - othersTotal }
  }
  const addPerson=()=>setF(p=>({...p, people:[...p.people, {name:'', amount:''}]}))
  const setPerson=(i,k,v)=>setF(p=>({...p, people:p.people.map((x,j)=>j===i?{...x,[k]:v}:x)}))
  const delPerson=(i)=>setF(p=>({...p, people:p.people.filter((_,j)=>j!==i)}))

  const splitting = f.split && named.length>0
  // A new Card-paid expense linked to a card is posted to that card (unless it's being split).
  const routesToCard = !initial && f.payment_method==='CARD' && f.card_id && !f.split

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Title" value={f.title} onChange={e=>s('title',e.target.value)} placeholder="e.g. Grocery" required/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount (₹)" type="number" step="0.01" value={f.amount} onChange={e=>s('amount',e.target.value)} required/>
        <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={f.category} onChange={e=>s('category',e.target.value)}>
          <option value="NEED">Recurring</option>
          <option value="WANT">Personal</option>
        </Select>
        <Select label="Sub-Category" value={f.category_name} onChange={e=>s('category_name',e.target.value)}>
          <option value="">Select</option>
          {EXPENSE_CATEGORIES[f.category]?.map(c=><option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Payment" value={f.payment_method} onChange={e=>s('payment_method',e.target.value)}>
          {PAYMENT_METHODS.map(m=><option key={m} value={m}>{payLabel(m)}</option>)}
        </Select>
        {f.payment_method==='CARD' && !initial && (
          cards.length>0 ? (
            <Select label="Which credit card?" value={f.card_id} onChange={e=>s('card_id',e.target.value)}>
              <option value="">Select a card…</option>
              {cards.map(c=><option key={c.id} value={c.id}>{c.name}{c.last4?` ···· ${c.last4}`:''}</option>)}
            </Select>
          ) : (
            <div className="text-[11px] text-amber-600 self-end pb-2">No cards yet — add one in Credit Cards to link card spends.</div>
          )
        )}
      </div>
      {f.payment_method!=='CASH' && f.payment_method!=='CARD' && banks.length>0 && (
        <div>
          <Select label="Paid from (bank account)" value={f.account_id} onChange={e=>s('account_id',e.target.value)}>
            <option value="">{banks.some(b=>b.purpose==='EXPENSE') ? 'Expense account (default)' : 'First account'}</option>
            {banks.map(b=><option key={b.id} value={b.id}>{b.name}{b.bank?` — ${b.bank}`:''} · {formatCurrency(b.balance)}</option>)}
          </Select>
          <p className="text-[11px] text-muted mt-1">This amount comes out of that account right away, and shows on its statement.{initial ? ' Changing the amount, payment type or account here fixes the balance automatically.' : ''}</p>
        </div>
      )}
      {f.payment_method==='CASH' && <p className="text-[11px] text-muted -mt-2">Cash spends never touch your bank balance.</p>}
      {routesToCard && (
        <p className="text-[11px] text-muted -mt-2">Counts in this month's expenses <b>and</b> adds to the card's outstanding — your bank Expense account isn't touched.</p>
      )}

      <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
        <input type="checkbox" checked={f.is_recurring} onChange={e=>s('is_recurring',e.target.checked)} className="w-4 h-4 accent-brand-600 rounded"/>
        Mark as recurring <span className="text-xs text-faint">(adds to the Recurring Monthly Expenses overview)</span>
      </label>

      {!initial && (
        <div className="rounded-lg border border-line p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
            <input type="checkbox" checked={f.split} onChange={e=>s('split',e.target.checked)} className="w-4 h-4 accent-brand-600 rounded"/>
            Split this expense with others
          </label>
          {f.split && (
            <>
              <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs font-medium">
                {[['equal','Split equally'],['custom','Per-person amount']].map(([m,l])=>(
                  <button key={m} type="button" onClick={()=>s('splitMode',m)}
                    className={`px-3 py-1 rounded-md transition-colors ${f.splitMode===m?'bg-brand-600 text-white':'text-muted hover:text-content'}`}>{l}</button>
                ))}
              </div>
              {f.people.map((p,i)=>(
                <div key={i} className="flex gap-2 items-center">
                  <Input placeholder="Person's name" value={p.name} onChange={e=>setPerson(i,'name',e.target.value)} className="flex-1"/>
                  {f.splitMode==='custom' && <div className="w-28"><Input type="number" step="any" placeholder="₹ owed" value={p.amount} onChange={e=>setPerson(i,'amount',e.target.value)}/></div>}
                  <button type="button" onClick={()=>delPerson(i)} className="text-faint hover:text-red-500 px-1"><Trash2 size={15}/></button>
                </div>
              ))}
              <button type="button" onClick={addPerson} className="text-xs font-medium text-brand-600 hover:underline flex items-center gap-1"><Plus size={13}/> Add person</button>
              {splitting && total>0 && (
                <div className="text-xs bg-surface-2 rounded-lg p-2.5">
                  {f.splitMode==='equal'
                    ? <p className="text-content">Split <b>{named.length+1}</b> ways (incl. you) — your share <b>{formatCurrency(yourShare)}</b>, each of {named.length} owes <b>{formatCurrency(eachEqual)}</b>.</p>
                    : <p className={`${yourShare<0?'text-red-600':'text-content'}`}>Your share <b>{formatCurrency(yourShare)}</b> · {named.length} will owe you <b>{formatCurrency(othersTotal)}</b> total.</p>}
                  <p className="text-faint mt-0.5">Only your share counts as your expense; the rest is added to Lending &amp; Debts (to receive).</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{routesToCard ? 'Add to Card' : splitting ? 'Add & Split' : `${initial?'Update':'Add'} Expense`}</Button>
      </div>
    </form>
  )
}

// Old entries (e.g. rent logged with "Mark paid" before this fix) that never left the bank.
function UnsettledBanner({ onDone }) {
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState({})
  const [busy, setBusy] = useState(false)
  const load = () => window.api.expense.unsettled().then(r => { setInfo(r); setPicked(Object.fromEntries(r.rows.map(x => [x.id, true]))) }).catch(() => setInfo(null))
  useEffect(() => { load() }, [])
  if (!info || !info.rows.length) return null
  const chosen = info.rows.filter(r => picked[r.id])
  const chosenTotal = chosen.reduce((s, r) => s + Number(r.amount), 0)
  const apply = async () => {
    setBusy(true)
    try {
      const r = await window.api.expense.settleUnsettled(chosen.map(x => x.id), info.account?.id)
      toast.success(`${formatCurrency(r.total)} taken out of ${info.account?.name || 'your account'} for ${r.count} entr${r.count === 1 ? 'y' : 'ies'}`)
      setOpen(false); await load(); onDone?.()
    } catch (e) { toast.error(e.message || 'Could not fix these') } finally { setBusy(false) }
  }
  return (
    <>
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0"/>
            <div>
              <p className="text-sm font-semibold text-amber-900">{info.rows.length} expense{info.rows.length!==1?'s':''} ({formatCurrency(info.total)}) never left your bank account</p>
              <p className="text-xs text-amber-800">They were logged as paid by UPI / transfer, but the balance was never reduced. That's why your bank balance looks too high.</p>
            </div>
          </div>
          <Button onClick={()=>setOpen(true)}>Review &amp; fix</Button>
        </CardContent>
      </Card>
      <Modal open={open} onClose={()=>setOpen(false)} title="Fix balance for past expenses">
        <div className="space-y-3">
          <p className="text-sm text-muted">Untick anything you already adjusted by hand or paid from somewhere else. Ticked entries are taken out of <b className="text-content">{info.account ? `${info.account.name} (${formatCurrency(info.account.balance)})` : 'no account — add a bank account first'}</b>, dated on the day of each expense.</p>
          <div className="max-h-72 overflow-y-auto border border-line rounded-lg divide-y divide-line">
            {info.rows.map(r => (
              <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!picked[r.id]} onChange={e=>setPicked(p=>({...p,[r.id]:e.target.checked}))} className="w-4 h-4 accent-brand-600"/>
                <span className="flex-1 min-w-0 truncate text-content">{r.title}<span className="text-xs text-faint ml-2">{r.date}</span></span>
                <span className="tabular font-medium text-content">{formatCurrency(r.amount)}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-content">Will debit <b className="tabular">{formatCurrency(chosenTotal)}</b></p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button>
              <Button onClick={apply} disabled={busy || !chosen.length || !info.account}>{busy ? 'Applying…' : 'Apply'}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default function Expenses() {
  const { expenses, loading, fetchByMonthYear, create, update, delete:del, restore, filters, setFilters } = useExpenseStore()
  const [modal, setModal] = useState({open:false,item:null,defaultDate:null})
  const [openDates, setOpenDates] = useState({})
  const [trashOpen, setTrashOpen] = useState(false)

  useEffect(()=>{ fetchByMonthYear(filters.month, filters.year) }, [filters.month, filters.year])

  // Spend-alert settings + live Expense-account balance (auto-debited as you spend).
  const [alerts, setAlerts] = useState({ daily_limit:0, low_balance_threshold:3000 })
  const [expenseBal, setExpenseBal] = useState(null)
  const loadBal = () => window.api.bank.getAll()
    .then(bs=>{ const exp = bs.filter(b=>b.purpose==='EXPENSE'); setExpenseBal(exp.length ? exp.reduce((s,b)=>s+Number(b.balance||0),0) : null) })
    .catch(()=>setExpenseBal(null))
  useEffect(()=>{
    const loadAlerts = () => window.api.settings.getAll().then(setAlerts).catch(()=>{})
    loadAlerts(); loadBal()
    const h = () => { loadAlerts(); loadBal() }
    window.addEventListener('settings-changed', h)
    return () => window.removeEventListener('settings-changed', h)
  }, [])

  const [budget, setBudget] = useState(0)
  useEffect(()=>{
    window.api.salary.getAll().then(rows=>{
      const a = rows.find(r=>r.month===filters.month && r.year===filters.year)
      setBudget(a ? Number(a.needs_amount||0)+Number(a.wants_amount||0) : 0)
    }).catch(()=>setBudget(0))
  }, [filters.month, filters.year])

  const needsTotal = expenses.filter(e=>e.category==='NEED').reduce((s,e)=>s+Number(e.amount),0)
  const wantsTotal = expenses.filter(e=>e.category==='WANT').reduce((s,e)=>s+Number(e.amount),0)
  const monthTotal = needsTotal + wantsTotal
  const remainingBudget = budget - monthTotal

  const handleSave = async(data)=>{
    const total = Number(data.amount) || 0
    const named = (data.people || []).filter(p => p.name && p.name.trim())
    if (!modal.item && data.split && named.length) {
      // Split: others' shares become "to receive" in Lending & Debts; only your share is your expense.
      let others, yourShare
      if (data.splitMode === 'custom') {
        others = named.map(p => ({ name: p.name.trim(), amount: Number(p.amount) || 0 }))
        yourShare = total - others.reduce((s, o) => s + o.amount, 0)
      } else {
        const per = total / (named.length + 1)
        others = named.map(p => ({ name: p.name.trim(), amount: per }))
        yourShare = total - per * named.length
      }
      if (yourShare < 0) yourShare = 0
      const note = `Split ${formatCurrency(total)} with ${others.map(o => o.name).join(', ')} — you paid; your share ${formatCurrency(yourShare)}`
      await window.api.expense.create({
        title: data.title, amount: yourShare, category: data.category, category_name: data.category_name || null,
        date: data.date, notes: [data.notes, note].filter(Boolean).join(' · '),
        payment_method: data.payment_method || 'UPI', is_recurring: data.is_recurring ? 1 : 0, account_id: data.account_id || null,
      })
      for (const o of others) if (o.amount > 0) {
        await window.api.loan.create({ kind: 'LEND', person: o.name, amount: o.amount, date: data.date, reason: `Split: ${data.title}`, settled: false })
      }
      toast.success(`Split recorded — ${others.length} added to Lending & Debts`)
    } else if (modal.item) {
      await update(modal.item.id, data)
    } else {
      // Card-paid expenses are normal expenses tagged with the card: they count in your
      // monthly spending AND add to that card's outstanding, but never touch the bank account.
      await create(data)
      if (data.payment_method === 'CARD' && data.card_id) toast('Also added to your card outstanding', { icon: '💳' })
    }
    fetchByMonthYear(filters.month, filters.year)
    loadBal()
    // Daily spend warning — for any new spend dated today (cash/card/UPI all count).
    if (!modal.item && Number(alerts.daily_limit) > 0 && data.date === todayStr()) {
      const dayTotal = expenses.filter(e=>e.date===data.date).reduce((s,e)=>s+Number(e.amount),0) + total
      if (dayTotal > Number(alerts.daily_limit)) {
        toast(`You've spent ${formatCurrency(dayTotal)} today — over your ${formatCurrency(alerts.daily_limit)} daily limit`, { icon:'⚠️', duration:6000 })
      }
    }
  }
  const daysLeftInMonth = (() => { const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate() - n.getDate() })()
  const lowBalance = expenseBal != null && Number(alerts.low_balance_threshold) > 0 && expenseBal < Number(alerts.low_balance_threshold)
  const addFor = (date) => setModal({open:true,item:null,defaultDate:date})

  // Delete = move to Trash (reversible). Show an Undo toast; nothing is truly removed until the
  // user permanently deletes it from Trash.
  const handleDelete = async (e) => {
    await del(e.id)
    loadBal()
    toast((t)=>(
      <span className="flex items-center gap-3 text-sm">
        <span>Moved <b>{e.title}</b> to Trash</span>
        <button
          onClick={async()=>{ toast.dismiss(t.id); await restore(e.id); await fetchByMonthYear(filters.month, filters.year); loadBal(); toast.success('Restored') }}
          className="font-semibold text-brand-600 hover:underline shrink-0">Undo</button>
      </span>
    ), { icon:'🗑️', duration:6000 })
  }

  // Group expenses by date, then include EVERY day of the month (up to today for the current
  // month) — even days with no spending — so a forgotten day is visible with an Add option.
  const byDate = {}
  for (const e of expenses) (byDate[e.date]=byDate[e.date]||[]).push(e)
  const now = new Date()
  const isCurrentMonth = filters.month===now.getMonth()+1 && filters.year===now.getFullYear()
  const today = todayStr()
  const lastDay = isCurrentMonth ? now.getDate() : new Date(filters.year, filters.month, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    const key = `${filters.year}-${pad2(filters.month)}-${pad2(d)}`
    if (!byDate[key]) byDate[key] = []
  }
  const dates = Object.keys(byDate).sort((a,b)=>b.localeCompare(a))
  const isOpen = (date,idx)=> openDates[date] ?? (idx===0)
  const toggle = (date,idx)=> setOpenDates(p=>({...p,[date]: !isOpen(date,idx)}))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Expenses</h2>
          <p className="text-sm text-muted">Day-by-day spending — includes cash, UPI &amp; card. Card spends also add to that card's outstanding.</p></div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={()=>setTrashOpen(true)} title="Recently deleted"><Trash2 size={16}/> Trash</Button>
          <Button onClick={()=>setModal({open:true,item:null,defaultDate:null})}><Plus size={16}/> Add Expense</Button>
        </div>
      </div>

      <UnsettledBanner onDone={()=>{ fetchByMonthYear(filters.month, filters.year); loadBal() }} />

      {expenseBal != null && (
        <Card>
          <CardContent className="py-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Wallet className="text-orange-600" size={18}/></div>
              <div>
                <p className="text-xs text-muted">In your Expense account — same balance as the Bank tab</p>
                <p className={`text-xl font-bold tabular ${expenseBal<0?'text-red-600':'text-content'}`}>{formatCurrency(expenseBal)}{expenseBal<0 && <span className="text-xs font-normal ml-1">overspent</span>}</p>
              </div>
            </div>
            <span className="text-xs text-muted">{daysLeftInMonth} day{daysLeftInMonth!==1?'s':''} left this month</span>
          </CardContent>
        </Card>
      )}

      {lowBalance && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0"/>
            <div>
              <p className="text-sm font-semibold text-red-800">Low account balance — {formatCurrency(expenseBal)} left in your Expense account</p>
              <p className="text-xs text-red-700">{daysLeftInMonth} day{daysLeftInMonth!==1?'s':''} remaining this month — spend wisely.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month picker + monthly total */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Filter size={16} className="text-faint"/>
              <Select value={filters.month} onChange={e=>setFilters({month:Number(e.target.value)})} className="w-36">
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </Select>
              <Select value={filters.year} onChange={e=>setFilters({year:Number(e.target.value)})} className="w-24">
                {[CY-2,CY-1,CY,CY+1].map(y=><option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-content">{formatCurrency(monthTotal)}</p>
              <p className="text-xs text-muted">{MONTHS[filters.month-1]} {filters.year} · Recurring {formatCurrency(needsTotal)} · Personal {formatCurrency(wantsTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expense budget (Recurring + Personal allocation) */}
      {budget > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-3 gap-4 text-center mb-3">
              <div><p className="text-xl font-bold text-brand-600">{formatCurrency(budget)}</p><p className="text-xs text-muted">Expense Budget</p></div>
              <div><p className="text-xl font-bold text-orange-600">{formatCurrency(monthTotal)}</p><p className="text-xs text-muted">Used</p></div>
              <div><p className={`text-xl font-bold ${remainingBudget>=0?'text-green-600':'text-red-600'}`}>{formatCurrency(remainingBudget)}</p><p className="text-xs text-muted">Remaining</p></div>
            </div>
            <ProgressBar value={Math.min(monthTotal, budget)} max={budget||1} color={monthTotal>budget?'red':'blue'} showLabel/>
            {remainingBudget<0 && <p className="text-xs text-red-500 mt-1">Over budget by {formatCurrency(-remainingBudget)}</p>}
          </CardContent>
        </Card>
      )}

      {/* Date-grouped list */}
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
          : dates.length===0 ? (
            <div className="text-center py-16 text-faint">
              <Receipt size={40} className="mx-auto mb-3 text-faint"/>
              <p>No expenses for this month</p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {dates.map((date, idx)=>{
                const items = byDate[date]
                const dayTotal = items.reduce((s,e)=>s+Number(e.amount),0)
                const open = isOpen(date, idx)
                return (
                  <div key={date}>
                    <button onClick={()=>toggle(date,idx)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <ChevronRight size={16} className={`text-faint transition-transform ${open?'rotate-90':''}`}/>
                        <div>
                          <p className="text-sm font-semibold text-content">{fmtDay(date)}{date===today?' · Today':''}</p>
                          <p className="text-xs text-faint">{items.length} item{items.length!==1?'s':''}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-content">{formatCurrency(dayTotal)}</p>
                    </button>
                    {open && (items.length===0 ? (
                      <div className="px-12 pb-3 text-xs text-faint">No expenses on this day. <button onClick={()=>addFor(date)} className="text-brand-600 underline">Add one</button></div>
                    ) : (
                      <div className="bg-surface-2/40">
                        {items.map(e=>(
                          <div key={e.id} className="flex items-center justify-between px-12 py-2.5 hover:bg-surface-2/50">
                            <div>
                              <p className="text-sm font-medium text-content">{e.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant={e.category==='NEED'?'info':'warning'}>{e.category_name||catLabel(e.category)}</Badge>
                                <span className="text-xs text-faint">{e.payment_method}</span>
                                {e.is_recurring ? <span className="text-xs text-brand-500">↻ recurring</span> : null}
                                <UpdatedAt at={e.updated_at || e.created_at} icon={false}/>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-semibold mr-1">{formatCurrency(e.amount)}</span>
                              <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:e,defaultDate:null})}><Pencil size={13} className="text-muted"/></Button>
                              <Button size="icon" variant="ghost" onClick={()=>handleDelete(e)}><Trash2 size={13} className="text-red-400"/></Button>
                            </div>
                          </div>
                        ))}
                        <div className="px-12 py-2">
                          <button onClick={()=>addFor(date)} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> Add to this day</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null,defaultDate:null})} title={modal.item?'Edit Expense':'Add Expense'}>
        <ExpenseForm initial={modal.item} defaultDate={modal.defaultDate} onSave={handleSave} onClose={()=>setModal({open:false,item:null,defaultDate:null})}/>
      </Modal>

      {trashOpen && (
        <TrashModal onClose={()=>setTrashOpen(false)} onChanged={()=>{ fetchByMonthYear(filters.month, filters.year); loadBal() }}/>
      )}
    </div>
  )
}

// Recently-deleted expenses. Restoring re-applies the expense (and its account debit);
// "Delete forever" is the only truly destructive action, and it's one extra click away.
function TrashModal({ onClose, onChanged }) {
  const [rows, setRows] = useState(null)
  const load = () => window.api.expense.trashList().then(setRows).catch(()=>setRows([]))
  useEffect(()=>{ load() }, [])
  const doRestore = async (id) => { await window.api.expense.restore(id); toast.success('Restored'); onChanged?.(); load() }
  const doPurge = async (id) => { await window.api.expense.purge(id); toast.success('Permanently deleted'); load() }
  return (
    <Modal open onClose={onClose} title="Recently deleted">
      {rows===null ? (
        <div className="py-8 text-center text-faint text-sm">Loading…</div>
      ) : rows.length===0 ? (
        <div className="py-10 text-center text-faint"><Trash2 size={32} className="mx-auto mb-2"/><p className="text-sm">Trash is empty</p></div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted">Deleted expenses are kept here so nothing is lost. Restore brings one back (and re-applies its account debit).</p>
          {rows.map(e=>(
            <div key={e.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-line">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content truncate">{e.title}</span>
                  <Badge variant={e.category==='NEED'?'info':'warning'}>{e.category_name||catLabel(e.category)}</Badge>
                </div>
                <p className="text-[11px] text-faint">{e.date} · {formatCurrency(e.amount)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={()=>doRestore(e.id)}>Restore</Button>
                <Button size="icon" variant="ghost" onClick={()=>doPurge(e.id)} title="Delete forever"><Trash2 size={13} className="text-red-500"/></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
