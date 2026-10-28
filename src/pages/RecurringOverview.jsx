import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Select } from '../components/ui/Input'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, MONTHS, catLabel } from '../lib/utils'
import { Repeat } from 'lucide-react'

const CY = new Date().getFullYear()
const COLORS = ['#5B8CFF','#3DBE8B','#D6B875','#F59E0B','#A78BFA','#22D3EE','#F472B6','#94A3B8']

// Read-only overview of the expenses you tagged "recurring" for a month, aggregated so you
// can see the total and, per category, where the money goes.
export default function RecurringOverview({ onTotal }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.api.expense.getAll({ month, year }).then(all => {
      const rec = all.filter(e => e.is_recurring)
      setItems(rec)
      onTotal?.(rec.reduce((s, e) => s + Number(e.amount || 0), 0))
    }).catch(() => { setItems([]); onTotal?.(0) }).finally(() => setLoading(false))
  }, [month, year])

  const total = items.reduce((s, e) => s + Number(e.amount || 0), 0)
  // Aggregate by category (sub-category if present, else Recurring/Personal label).
  const byCat = {}
  for (const e of items) {
    const key = e.category_name || catLabel(e.category)
    byCat[key] = (byCat[key] || 0) + Number(e.amount || 0)
  }
  const cats = Object.entries(byCat).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-content">Recurring Monthly Expenses</h2>
          <p className="text-sm text-muted">Everything you tagged “recurring” — see where you can cut back</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={e=>setMonth(Number(e.target.value))} className="w-36">
            {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={e=>setYear(Number(e.target.value))} className="w-24">
            {[CY-2,CY-1,CY,CY+1].map(y=><option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="py-5 text-center">
          <p className="text-3xl font-bold text-content tabular">{formatCurrency(total)}</p>
          <p className="text-xs text-muted mt-1">Total recurring spend · {MONTHS[month-1]} {year} · {items.length} item{items.length!==1?'s':''}</p>
        </CardContent>
      </Card>

      {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
      : items.length === 0 ? (
        <Card><CardContent className="text-center py-16 text-faint">
          <Repeat size={40} className="mx-auto mb-3 text-faint"/>
          <p className="mb-1">No recurring expenses tagged this month</p>
          <p className="text-xs">Tick “Recurring” when adding an expense (e.g. Groceries) and it shows up here automatically.</p>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Summary by category</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cats.map((c,i)=>(
                <div key={c.name} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:COLORS[i%COLORS.length]}}/>
                  <span className="text-sm text-content w-40 truncate">{c.name}</span>
                  <div className="flex-1"><div className="w-full bg-surface-2 rounded-full h-2"><div className="h-2 rounded-full" style={{width:`${total>0?(c.amount/total)*100:0}%`, background:COLORS[i%COLORS.length]}}/></div></div>
                  <span className="text-xs text-muted w-12 text-right tabular">{total>0?((c.amount/total)*100).toFixed(0):0}%</span>
                  <span className="text-sm font-semibold text-content w-24 text-right tabular">{formatCurrency(c.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Entries</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {items.map(e=>(
                  <div key={e.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content truncate">{e.title}</p>
                      <p className="text-xs text-faint">{e.category_name || catLabel(e.category)} · {e.date}</p>
                    </div>
                    <span className="text-sm font-semibold text-content tabular">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
