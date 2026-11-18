import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent } from '../components/ui/Card'
import { formatCurrency, MONTHS } from '../lib/utils'
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'

const COLORS = ['#5B8DEF', '#8B6CFF', '#2FBF8F', '#F5A524', '#EF6B73', '#35B6C9', '#C77DFF', '#9CA3AF', '#F2994A', '#6FCF97']

export const catName = (e) => {
  let n = String(e.category_name || '').trim()
  if (!n) return 'Other'
  n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
  return n === 'Groceries' ? 'Grocery' : n
}
const sumBy = (rows) => { const m = {}; for (const e of rows) m[catName(e)] = (m[catName(e)] || 0) + Number(e.amount || 0); return m }
const prevOf = (y, m) => (m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 })

export default function CategoryView({ months }) {
  const [sel, setSel] = useState(months[0] ? `${months[0].year}-${Number(months[0].month)}` : '')
  const [cur, setCur] = useState(null)
  const [prev, setPrev] = useState(null)

  const [year, month] = sel.split('-').map(Number)
  useEffect(() => {
    if (!year) return
    setCur(null); setPrev(null)
    const p = prevOf(year, month)
    window.api.expense.getAll({ month, year }).then(setCur).catch(() => setCur([]))
    window.api.expense.getAll({ month: p.month, year: p.year }).then(setPrev).catch(() => setPrev([]))
  }, [sel])

  const data = useMemo(() => {
    if (!cur || !prev) return null
    const a = sumBy(cur), b = sumBy(prev)
    const total = Object.values(a).reduce((s, v) => s + v, 0)
    const prevTotal = Object.values(b).reduce((s, v) => s + v, 0)
    const rows = [...new Set([...Object.keys(a), ...Object.keys(b)])].map(name => {
      const now = a[name] || 0, before = b[name] || 0
      return { name, now, before, delta: now - before, pct: before ? (now - before) / before : null, share: total ? now / total : 0 }
    }).sort((x, y) => y.now - x.now)
    return { rows, total, prevTotal }
  }, [cur, prev])

  if (!months.length) return null
  const p = prevOf(year, month)
  const label = `${MONTHS[month - 1]} ${year}`
  const prevLabel = MONTHS[p.month - 1]

  return (
    <div className="space-y-4">
      <select value={sel} onChange={e => setSel(e.target.value)}
        className="w-full md:w-72 rounded-xl border border-line bg-surface-2 text-content px-3 py-2.5 text-sm">
        {months.map(m => <option key={`${m.year}-${m.month}`} value={`${m.year}-${Number(m.month)}`}>{MONTHS[Number(m.month) - 1]} {m.year}</option>)}
      </select>

      {!data ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-600"/></div> : (() => {
        const { rows, total, prevTotal } = data
        const chg = prevTotal ? (total - prevTotal) / prevTotal : null
        const risers = rows.filter(r => r.delta > 0 && r.now > 0).sort((x, y) => y.delta - x.delta).slice(0, 3)
        const pie = rows.filter(r => r.now > 0)
        const bars = rows.filter(r => r.now > 0 || r.before > 0).slice(0, 8).map(r => ({ name: r.name, [prevLabel]: r.before, [label.split(' ')[0]]: r.now }))
        return (<>
          <Card><CardContent className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Total spent in {label}</p>
                <p className="text-2xl font-bold text-content tabular">{formatCurrency(total)}</p>
              </div>
              {chg !== null ? (
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold ${chg > 0 ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-500'}`}>
                  {chg > 0 ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                  {Math.abs(chg * 100).toFixed(1)}%<span className="text-[11px] font-medium opacity-80 ml-0.5">vs {prevLabel}</span>
                </div>
              ) : <span className="text-xs text-faint">No spending in {prevLabel}</span>}
            </div>
            {chg !== null && <p className="text-xs text-muted mt-2">{chg > 0 ? `${formatCurrency(total - prevTotal)} more than ${prevLabel} (${formatCurrency(prevTotal)})` : `${formatCurrency(prevTotal - total)} less than ${prevLabel} (${formatCurrency(prevTotal)})`}</p>}
          </CardContent></Card>

          {risers.length > 0 && (
            <Card><CardContent className="py-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-content mb-2"><Sparkles size={15} className="text-amber-500"/> Where you spent extra</p>
              <div className="space-y-1.5">
                {risers.map(r => (
                  <div key={r.name} className="flex items-center justify-between text-sm">
                    <span className="text-content">{r.name}</span>
                    <span className="text-red-500 font-semibold tabular">+{formatCurrency(r.delta)}{r.pct !== null ? ` (${(r.pct * 100).toFixed(0)}%)` : ' · new'}</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}

          {pie.length > 0 && (
            <Card><CardContent className="py-4">
              <p className="text-sm font-semibold text-content mb-1">Share by category</p>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="now" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
                      {pie.map((r, i) => <Cell key={r.name} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: '#111a2e', border: '1px solid #26324d', borderRadius: 10, color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent></Card>
          )}

          <Card><CardContent className="p-0">
            <div className="px-4 pt-4 pb-2 text-sm font-semibold text-content">Category breakdown</div>
            {rows.length === 0 && <p className="px-4 pb-4 text-sm text-faint">No spending recorded for this month.</p>}
            {rows.map((r, i) => {
              const up = r.delta > 0, flat = r.delta === 0
              return (
                <div key={r.name} className="px-4 py-3 border-t border-line/60">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-sm font-medium text-content truncate">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-content tabular">{formatCurrency(r.now)}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[62px] text-center ${r.pct === null ? (r.now ? 'bg-amber-500/15 text-amber-500' : 'text-faint') : flat ? 'text-faint' : up ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-500'}`}>
                        {r.pct === null ? (r.now ? 'New' : '–') : flat ? '0%' : `${up ? '▲' : '▼'} ${Math.abs(r.pct * 100).toFixed(0)}%`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, r.share * 100)}%`, background: COLORS[i % COLORS.length] }} /></div>
                  <p className="mt-1 text-[11px] text-faint">{(r.share * 100).toFixed(1)}% of spending · {prevLabel}: {formatCurrency(r.before)}</p>
                </div>
              )
            })}
          </CardContent></Card>

          {bars.length > 0 && (
            <Card><CardContent className="py-4">
              <p className="text-sm font-semibold text-content mb-2">{prevLabel} vs {label.split(' ')[0]}</p>
              <div style={{ height: Math.max(180, bars.length * 44) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={78} tick={{ fill: '#9aa6c0', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: '#111a2e', border: '1px solid #26324d', borderRadius: 10, color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={prevLabel} fill="#475569" radius={[0, 4, 4, 0]} barSize={9} />
                    <Bar dataKey={label.split(' ')[0]} fill="#5B8DEF" radius={[0, 4, 4, 0]} barSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent></Card>
          )}
        </>)
      })()}
    </div>
  )
}
