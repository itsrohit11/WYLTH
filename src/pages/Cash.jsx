import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { UpdatedAt } from '../components/ui/UpdatedAt'
import StatementModal from '../components/StatementModal'
import { formatCurrency, localToday, fmtDate } from '../lib/utils'
import { Banknote, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ScrollText, SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'

const SOURCE = { MANUAL: ['Manual', 'default'], ADJUSTMENT: ['Correction', 'warning'], TRANSFER: ['Bank ⇄ cash', 'info'], OPENING: ['Opening', 'info'] }
const today = () => localToday()

// Add cash (money in) or spend / take out cash (money out).
function MoveForm({ balance, initialType, onDone, onClose }) {
  const [type, setType] = useState(initialType || 'CREDIT')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())
  const amt = Number(amount) || 0
  const after = type === 'CREDIT' ? balance + amt : balance - amt
  const submit = async (e) => {
    e.preventDefault()
    const r = await window.api.cash.adjust({ amount: amt, type, note: note.trim(), date })
    if (!r.ok) { toast.error(r.error || 'Could not save'); return }
    toast.success(type === 'CREDIT' ? 'Cash added' : 'Cash spent'); onDone(); onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        {[['CREDIT', '+ Cash received'], ['DEBIT', '− Cash spent']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setType(k)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${type === k
              ? k === 'CREDIT' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
              : 'border-line text-muted hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>
      <Input label="Amount (₹)" type="number" step="any" min={0} value={amount} onChange={e => setAmount(e.target.value)} required autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Note (shows on statement)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Gift, auto fare, groceries" />
        <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>
      {amt > 0 && <p className="text-xs text-muted">Cash in hand will be <b className={after < 0 ? 'text-red-600' : 'text-content'}>{formatCurrency(after)}</b></p>}
      {amt > 0 && after < 0 && <p className="text-xs text-red-600">You only have {formatCurrency(balance)} in cash.</p>}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={type === 'CREDIT' ? 'success' : 'danger'} disabled={amt > 0 && after < 0}>{type === 'CREDIT' ? 'Add' : 'Spend'} {amt > 0 ? formatCurrency(amt) : ''}</Button>
      </div>
    </form>
  )
}

// ATM withdrawal (bank -> cash) or depositing cash (cash -> bank). Both sides are recorded.
function TransferForm({ balance, onDone, onClose }) {
  const [accounts, setAccounts] = useState([])
  const [direction, setDirection] = useState('BANK_TO_CASH')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  useEffect(() => {
    window.api.bank.getAll().then(a => {
      setAccounts(a || [])
      const pref = (a || []).find(x => x.purpose === 'EXPENSE') || (a || [])[0]
      if (pref) setAccountId(String(pref.id))
    }).catch(() => {})
  }, [])
  const acc = accounts.find(a => String(a.id) === accountId)
  const amt = Number(amount) || 0
  const toCash = direction === 'BANK_TO_CASH'
  const submit = async (e) => {
    e.preventDefault()
    const r = await window.api.cash.transfer({ account_id: Number(accountId), amount: amt, direction, date })
    if (!r.ok) { toast.error(r.error || 'Could not move the money'); return }
    toast.success(toCash ? 'Cash withdrawn from the account' : 'Cash deposited to the account'); onDone(); onClose()
  }
  if (accounts.length === 0) return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Add a bank account in <b>Bank Accounts</b> first, then you can move money between it and your cash.</p>
      <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </div>
  )
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        {[['BANK_TO_CASH', 'Bank → Cash (ATM)'], ['CASH_TO_BANK', 'Cash → Bank (deposit)']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setDirection(k)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${direction === k ? 'bg-brand-100 border-brand-400 text-brand-700' : 'border-line text-muted hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>
      <Select label="Bank account" value={accountId} onChange={e => setAccountId(e.target.value)}>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.bank || a.name} — {a.name} · {formatCurrency(a.balance)}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount (₹)" type="number" step="any" min={0} value={amount} onChange={e => setAmount(e.target.value)} required autoFocus />
        <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>
      {amt > 0 && acc && (
        <div className="grid grid-cols-2 gap-3 bg-surface-2 rounded-lg p-3 text-center text-xs">
          <div><p className="text-muted">{acc.bank || acc.name}</p><p className="text-sm font-semibold text-content tabular">{formatCurrency((Number(acc.balance) || 0) + (toCash ? -amt : amt))}</p></div>
          <div><p className="text-muted">Cash in hand</p><p className={`text-sm font-semibold tabular ${balance + (toCash ? amt : -amt) < 0 ? 'text-red-600' : 'text-content'}`}>{formatCurrency(balance + (toCash ? amt : -amt))}</p></div>
        </div>
      )}
      <p className="text-[11px] text-faint">Net worth stays the same: the money just moves between your bank and your pocket. Both statements show the entry.</p>
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!(amt > 0) || (!toCash && balance - amt < 0)}>Move {amt > 0 ? formatCurrency(amt) : ''}</Button>
      </div>
    </form>
  )
}

// Fix the balance to match the cash you actually have; the difference is logged on the statement.
function SetBalanceForm({ balance, onDone, onClose }) {
  const [value, setValue] = useState(String(balance))
  const [note, setNote] = useState('')
  const diff = (Number(value) || 0) - balance
  const submit = async (e) => {
    e.preventDefault()
    const r = await window.api.cash.setBalance({ balance: Number(value), note: note.trim() })
    if (!r.ok) { toast.error(r.error || 'Could not save'); return }
    toast.success('Cash balance updated'); onDone(); onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Count the cash you have and enter it. The difference is added to the statement as a correction.</p>
      <Input label="Cash in hand now (₹)" type="number" step="any" min={0} value={value} onChange={e => setValue(e.target.value)} required autoFocus />
      <Input label="Note (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Opening cash, recounted" />
      {diff !== 0 && <p className="text-xs text-muted">This records a <b className={diff > 0 ? 'text-green-600' : 'text-red-600'}>{diff > 0 ? '+' : '−'}{formatCurrency(Math.abs(diff))}</b> correction.</p>}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save balance</Button>
      </div>
    </form>
  )
}

export default function Cash() {
  const [state, setState] = useState({ balance: 0, lastEntryAt: null })
  const [recent, setRecent] = useState(null)
  const [monthIn, setMonthIn] = useState(0)
  const [monthOut, setMonthOut] = useState(0)
  const [modal, setModal] = useState(null)   // 'in' | 'out' | 'move' | 'set'
  const [showStatement, setShowStatement] = useState(false)

  const load = async () => {
    const [g, st] = await Promise.all([window.api.cash.get(), window.api.cash.statement()])
    setState(g)
    const rows = st.rows || []
    setRecent(rows.slice(0, 8))
    const ym = localToday().slice(0, 7)
    let i = 0, o = 0
    for (const r of rows) {
      if (String(r.date).slice(0, 7) !== ym || r.source === 'OPENING') continue
      if (r.type === 'CREDIT') i += Number(r.amount) || 0; else o += Number(r.amount) || 0
    }
    setMonthIn(i); setMonthOut(o)
  }
  useEffect(() => { load().catch(() => setRecent([])) }, [])

  const bal = Number(state.balance) || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Cash</h2>
          <p className="text-sm text-muted">Cash in hand, counted in your net worth</p></div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center"><Banknote className="text-brand-600" size={22} /></div>
              <div>
                <p className="text-xs text-muted">Cash in hand</p>
                <p className="text-3xl font-bold tabular text-content">{formatCurrency(bal)}</p>
                <UpdatedAt at={state.lastEntryAt} label="Last entry" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 text-right">
              <div><p className="text-xs text-muted">In this month</p><p className="text-lg font-bold tabular text-green-600">{formatCurrency(monthIn)}</p></div>
              <div><p className="text-xs text-muted">Out this month</p><p className="text-lg font-bold tabular text-red-600">{formatCurrency(monthOut)}</p></div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
            <button onClick={() => setModal('in')} className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 ring-1 ring-green-100 rounded-lg py-2 hover:bg-green-100 transition-colors"><ArrowDownLeft size={14} /> Add cash</button>
            <button onClick={() => setModal('out')} className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 ring-1 ring-red-100 rounded-lg py-2 hover:bg-red-100 transition-colors"><ArrowUpRight size={14} /> Spend cash</button>
            <button onClick={() => setModal('move')} className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 ring-1 ring-brand-100 rounded-lg py-2 hover:bg-brand-100 transition-colors"><ArrowLeftRight size={14} /> Bank ⇄ cash</button>
            <button onClick={() => setModal('set')} className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-muted bg-surface-2 ring-1 ring-line rounded-lg py-2 hover:text-content transition-colors"><SlidersHorizontal size={14} /> Set balance</button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <p className="text-sm font-semibold text-content">Recent entries</p>
            <button onClick={() => setShowStatement(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 ring-1 ring-brand-100 rounded-lg px-3 py-1.5 hover:bg-brand-100 transition-colors"><ScrollText size={13} /> Full statement</button>
          </div>
          {recent === null ? <p className="text-center py-10 text-faint text-sm">Loading…</p>
          : recent.length === 0 ? (
            <div className="text-center py-12 text-faint">
              <Banknote size={36} className="mx-auto mb-2" />
              <p className="text-sm">No cash entries yet</p>
              <p className="text-xs mt-1">Use <b>Set balance</b> to enter the cash you have now, or <b>Add cash</b> for money you receive.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {recent.map(r => {
                  const credit = r.type === 'CREDIT'
                  const [label, variant] = SOURCE[r.source] || [r.source, 'default']
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/60">
                      <td className="px-5 py-2.5 whitespace-nowrap text-muted w-28">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5"><p className="text-content truncate">{r.note || (credit ? 'Cash added' : 'Cash spent')}</p><Badge variant={variant}>{label}</Badge></td>
                      <td className={`px-5 py-2.5 text-right tabular font-semibold ${credit ? 'text-green-600' : 'text-red-600'}`}>{credit ? '+' : '−'}{formatCurrency(r.amount)}</td>
                      <td className="px-5 py-2.5 text-right tabular text-muted w-32">{formatCurrency(r.balance_after)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Modal open={modal === 'in' || modal === 'out'} onClose={() => setModal(null)} title={modal === 'in' ? 'Add cash' : 'Spend cash'} size="sm">
        <MoveForm key={modal} balance={bal} initialType={modal === 'out' ? 'DEBIT' : 'CREDIT'} onDone={load} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'move'} onClose={() => setModal(null)} title="Move money between bank and cash" size="sm">
        <TransferForm balance={bal} onDone={load} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'set'} onClose={() => setModal(null)} title="Set cash balance" size="sm">
        <SetBalanceForm balance={bal} onDone={load} onClose={() => setModal(null)} />
      </Modal>
      {showStatement && (
        <StatementModal
          account={{ id: 'cash', name: 'Cash', balance: bal }}
          load={(ym) => window.api.cash.statement(ym)}
          footnote="Every cash entry is listed here, newest first: cash added or spent, money moved to or from a bank account, and balance corrections."
          onClose={() => setShowStatement(false)} />
      )}
    </div>
  )
}
