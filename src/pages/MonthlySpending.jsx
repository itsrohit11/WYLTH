import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, MONTHS, catLabel } from '../lib/utils'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

const parseLocal = (s) => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1) }
const fmtDay = (s) => format(parseLocal(s), 'EEE, dd MMM')

export default function MonthlySpending() {
  const [months, setMonths] = useState(null)        // [{year, month, total, count, needs, wants}]
  const [openMonth, setOpenMonth] = useState(null)  // 'YYYY-MM'
  const [monthData, setMonthData] = useState({})    // 'YYYY-MM' -> expenses[]
  const [openDate, setOpenDate] = useState(null)    // 'YYYY-MM' + date
  const [budgets, setBudgets] = useState({})        // 'YYYY-M' -> recurring+personal allocation

  useEffect(()=>{ window.api.expense.monthTotals().then(setMonths).catch(()=>setMonths([])) }, [])
  useEffect(()=>{
    window.api.salary.getAll().then(rows=>{
      const map = {}
      for (const r of rows) map[`${r.year}-${r.month}`] = Number(r.needs_amount||0) + Number(r.wants_amount||0)
      setBudgets(map)
    }).catch(()=>{})
  }, [])
  const overspendOf = (m) => { const b = budgets[`${Number(m.year)}-${Number(m.month)}`] || 0; return b>0 ? Number(m.total)-b : 0 }

  const grandTotal = (months||[]).reduce((s,m)=>s+Number(m.total),0)

  const toggleMonth = async (m) => {
    const key = `${m.year}-${m.month}`
    if (openMonth===key) { setOpenMonth(null); setOpenDate(null); return }
    setOpenMonth(key); setOpenDate(null)
    if (!monthData[key]) {
      const exp = await window.api.expense.getAll({ month: Number(m.month), year: Number(m.year) })
      setMonthData(p=>({...p,[key]: exp}))
    }
  }

  if (months===null) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-content">Monthly Spending</h2>
        <p className="text-sm text-muted">Track your spending month by month — click to drill into days</p>
      </div>

      <Card>
        <CardContent className="py-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center"><CalendarDays className="text-brand-600" size={22}/></div>
          <div>
            <p className="text-xs text-muted">Total spent (all time)</p>
            <p className="text-2xl font-bold text-content">{formatCurrency(grandTotal)}</p>
          </div>
        </CardContent>
      </Card>

      {months.length===0 ? (
        <Card><CardContent className="text-center py-16 text-faint"><CalendarDays size={40} className="mx-auto mb-3 text-faint"/><p>No expenses recorded yet</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {months.map(m=>{
            const key = `${m.year}-${m.month}`
            const isOpen = openMonth===key
            const exp = monthData[key] || []
            const byDate = {}
            for (const e of exp) (byDate[e.date]=byDate[e.date]||[]).push(e)
            const dates = Object.keys(byDate).sort((a,b)=>b.localeCompare(a))
            return (
              <Card key={key}>
                <CardContent className="p-0">
                  <button onClick={()=>toggleMonth(m)} className="w-full flex items-center justify-between px-4 py-4 hover:bg-surface-2 transition-colors text-left">
                    <div className="flex items-center gap-2">
                      <ChevronRight size={18} className={`text-faint transition-transform ${isOpen?'rotate-90':''}`}/>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-content">{MONTHS[Number(m.month)-1]} {m.year}</p>
                          {overspendOf(m) > 0 && <Badge variant="danger">Over by {formatCurrency(overspendOf(m))}</Badge>}
                        </div>
                        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 text-xs">
                          <span><span className="text-faint">Recurring</span> <b className="text-brand-600 tabular">{formatCurrency(m.needs)}</b></span>
                          <span><span className="text-faint">Personal</span> <b className="text-amber-600 tabular">{formatCurrency(m.wants)}</b></span>
                          <span className="text-faint">· {m.count} item{Number(m.count)!==1?'s':''}</span>
                        </div>
                      </div>
                    </div>
                    <p className={`text-lg font-bold ${overspendOf(m)>0?'text-red-600':'text-content'}`}>{formatCurrency(m.total)}</p>
                  </button>

                  {isOpen && (
                    <div className="border-t border-line">
                      {dates.length===0 ? <div className="px-12 py-3 text-xs text-faint">Loading…</div> :
                        dates.map(date=>{
                          const items = byDate[date]
                          const dayTotal = items.reduce((s,e)=>s+Number(e.amount),0)
                          const dOpen = openDate===key+date
                          return (
                            <div key={date} className="border-b border-gray-50 last:border-0">
                              <button onClick={()=>setOpenDate(dOpen?null:key+date)} className="w-full flex items-center justify-between px-10 py-2.5 hover:bg-surface-2 transition-colors text-left">
                                <div className="flex items-center gap-2">
                                  <ChevronRight size={14} className={`text-faint transition-transform ${dOpen?'rotate-90':''}`}/>
                                  <p className="text-sm text-content">{fmtDay(date)}</p>
                                  <span className="text-xs text-faint">({items.length})</span>
                                </div>
                                <p className="text-sm font-semibold text-content">{formatCurrency(dayTotal)}</p>
                              </button>
                              {dOpen && (
                                <div className="bg-surface-2/50">
                                  {items.map(e=>(
                                    <div key={e.id} className="flex items-center justify-between px-16 py-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-content">{e.title}</span>
                                        <Badge variant={e.category==='NEED'?'info':'warning'}>{e.category_name||catLabel(e.category)}</Badge>
                                      </div>
                                      <span className="text-sm font-medium">{formatCurrency(e.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
