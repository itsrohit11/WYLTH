import { useEffect, useMemo, useState } from 'react'
import { Modal } from './ui/Modal'
import { Select } from './ui/Input'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { UpdatedAt } from './ui/UpdatedAt'
import { formatCurrency, fmtDate, MONTHS } from '../lib/utils'
import { ArrowDownLeft, ArrowUpRight, Download, ScrollText } from 'lucide-react'

const SOURCE = {
  MANUAL: ['Manual', 'default'], OPENING: ['Opening', 'info'], ADJUSTMENT: ['Adjustment', 'warning'],
  EXPENSE: ['Expense', 'danger'], CARD: ['Card bill', 'warning'], SAVINGS: ['Savings', 'success'], DEMAT: ['Demat', 'purple'],
  LOAN: ['Loan', 'warning'], SIP: ['SIP', 'info'], INVESTMENT_SALE: ['Investment sale', 'success'],
}
const ymLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

// Full statement for one bank account: every entry and exit, with the balance after each.
export default function StatementModal({ account, onClose }) {
  const [ym, setYm] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    let live = true
    window.api.bank.statement(account.id, ym || undefined).then(d => { if (live) setData(d) }).catch(() => live && setData({ rows: [], months: [] }))
    return () => { live = false }
  }, [account.id, ym])

  const rows = data?.rows || []
  const { credits, debits } = useMemo(() => rows.reduce((t, r) => {
    if (r.source === 'OPENING') return t
    if (r.type === 'CREDIT') t.credits += Number(r.amount) || 0; else t.debits += Number(r.amount) || 0
    return t
  }, { credits: 0, debits: 0 }), [rows])

  const download = () => {
    const head = ['Date', 'Description', 'Type', 'Source', 'Credit', 'Debit', 'Balance']
    const lines = [head.join(',')].concat(rows.map(r => [
      r.date, csvCell(r.note || ''), r.type, (SOURCE[r.source] || [r.source])[0],
      r.type === 'CREDIT' ? r.amount : '', r.type === 'DEBIT' ? r.amount : '', r.balance_after,
    ].join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `statement-${account.name.replace(/[^\w-]+/g, '_')}${ym ? '-' + ym : ''}.csv`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <Modal open onClose={onClose} title={`Statement — ${account.name}`} size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-muted">Current balance</p>
            <p className={`text-2xl font-bold tabular ${Number(account.balance) < 0 ? 'text-red-600' : 'text-content'}`}>{formatCurrency(account.balance)}</p>
            <UpdatedAt at={data?.lastEntryAt} label="Last entry" />
          </div>
          <div className="flex items-end gap-3">
            <div className="w-44">
              <Select label="Period" value={ym} onChange={e => setYm(e.target.value)}>
                <option value="">All time</option>
                {(data?.months || []).map(m => <option key={m} value={m}>{ymLabel(m)}</option>)}
              </Select>
            </div>
            <Button variant="outline" onClick={download} disabled={rows.length === 0}><Download size={15} /> CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-green-50 rounded-lg p-2.5"><p className="text-base font-bold text-green-700 tabular">{formatCurrency(credits)}</p><p className="text-[11px] text-green-700/80">Money in</p></div>
          <div className="bg-red-50 rounded-lg p-2.5"><p className="text-base font-bold text-red-700 tabular">{formatCurrency(debits)}</p><p className="text-[11px] text-red-700/80">Money out</p></div>
          <div className="bg-surface-2 rounded-lg p-2.5"><p className="text-base font-bold text-content tabular">{rows.length}</p><p className="text-[11px] text-muted">Entries</p></div>
        </div>

        {data === null ? <p className="text-center py-10 text-faint text-sm">Loading…</p>
        : rows.length === 0 ? (
          <div className="text-center py-12 text-faint"><ScrollText size={34} className="mx-auto mb-2" /><p className="text-sm">No entries for this period</p></div>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden">
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 sticky top-0">
                  <tr className="text-left text-xs font-semibold text-muted uppercase">
                    <th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5 text-right">In</th><th className="px-3 py-2.5 text-right">Out</th><th className="px-3 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(r => {
                    const credit = r.type === 'CREDIT'
                    const [label, variant] = SOURCE[r.source] || [r.source, 'default']
                    return (
                      <tr key={r.id} className="hover:bg-surface-2/60">
                        <td className="px-3 py-2 whitespace-nowrap text-muted">{fmtDate(r.date)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${credit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{credit ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}</span>
                            <div className="min-w-0"><p className="text-content truncate">{r.note || (credit ? 'Deposit' : 'Withdrawal')}</p><Badge variant={variant}>{label}</Badge></div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular font-medium text-green-600">{credit ? formatCurrency(r.amount) : ''}</td>
                        <td className="px-3 py-2 text-right tabular font-medium text-red-600">{!credit ? formatCurrency(r.amount) : ''}</td>
                        <td className={`px-3 py-2 text-right tabular ${Number(r.balance_after) < 0 ? 'text-red-600' : 'text-content'}`}>{formatCurrency(r.balance_after)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-[11px] text-faint">Every deposit, withdrawal, expense, savings move, demat transfer, loan settlement and investment sale on this account is listed here, newest first.</p>
      </div>
    </Modal>
  )
}
