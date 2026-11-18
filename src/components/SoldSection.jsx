import { useEffect, useState, Fragment } from 'react'
import { Card, CardContent } from './ui/Card'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { UpdatedAt } from './ui/UpdatedAt'
import { formatCurrency, fmtDate, fmtHolding, classifyGL } from '../lib/utils'
import { ChevronRight, Undo2, Receipt, Landmark, Info } from 'lucide-react'
import toast from 'react-hot-toast'

const num4 = (v) => String(+(Number(v) || 0).toFixed(4))
const sign = (v) => (Number(v) >= 0 ? '+' : '')

const unitWord = (t) => t === 'STOCKS' ? 'sh' : t === 'METALS' ? 'g' : 'units'
const isLumpType = (t) => !['STOCKS', 'SIP', 'CRYPTO', 'METALS'].includes(t)
const fyOf = (d) => { const [y, m] = String(d || '').split('-').map(Number); if (!y) return ''; const st = m >= 4 ? y : y - 1; return `${st}-${String((st + 1) % 100).padStart(2, '0')}` }

// Realised sales for ONE investment type — shown only inside that type's tab, never mixed with
// other types. Every row shows what was bought and sold, when, the charges, which account got the
// money, and the tax estimate.
export default function SoldSection({ type, refreshKey, onChanged }) {
  const [all, setAll] = useState(null)
  const [open, setOpen] = useState(null)
  const [fyPick, setFyPick] = useState(null)
  const label = String(type).replace('_', ' ').toLowerCase()

  const load = async () => {
    const a = await window.api.sale.getAll()
    setAll(a || [])
  }
  useEffect(() => { load().catch(() => setSales([])) }, [refreshKey])

  const undo = async (s) => {
    if (!window.confirm(`Undo the sale of ${s.title}?\n\nThe units go back into your portfolio and ${formatCurrency(s.net_proceeds)} is taken back out of ${s.account_name || 'the account'}.`)) return
    const r = await window.api.sale.undo(s.id)
    if (!r.ok) { toast.error(r.error || 'Could not undo'); return }
    toast.success('Sale undone'); await load(); onChanged && onChanged()
  }

  if (all === null) return null
  const sales = all.filter(x => x.type === type)
  // Per-financial-year summary for this type only. The tax figure adds up what each sale
  // added when it was recorded, so it already allows for sales of other types in the same year.
  const fys = Object.values(sales.reduce((m, x) => {
    const k = fyOf(x.sell_date)
    const b = (m[k] = m[k] || { fy: k, count: 0, st: 0, lt: 0, tax: 0, charges: 0 })
    b.count++; b.st += Number(x.st_gain) || 0; b.lt += Number(x.lt_gain) || 0; b.tax += Number(x.est_tax) || 0
    b.charges += (Number(x.brokerage) || 0) + (Number(x.stt) || 0)
    return m
  }, {})).sort((a, b) => b.fy.localeCompare(a.fy))
  const fy = fys.find(x => x.fy === fyPick) || fys[0]
  const totalGain = sales.reduce((t, x) => t + Number(x.gain || 0), 0)
  const totalNet = sales.reduce((t, x) => t + Number(x.net_proceeds || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-content flex items-center gap-2"><Receipt size={18} className="text-brand-600" /> Sold {label}</h3>
          <p className="text-sm text-muted">Realised sales of {label} — separate from your holdings above</p>
        </div>
        {sales.length > 0 && (
          <div className="flex gap-6 text-right">
            <div><p className="text-xs text-muted">Received</p><p className="text-lg font-bold tabular text-content">{formatCurrency(totalNet)}</p></div>
            <div><p className="text-xs text-muted">Realised P&amp;L</p><p className={`text-lg font-bold tabular ${classifyGL(totalGain)}`}>{sign(totalGain)}{formatCurrency(totalGain)}</p></div>
          </div>
        )}
      </div>

      {fy && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold text-content">Tax estimate by financial year</p>
              <div className="flex gap-1.5 flex-wrap">
                {fys.map(x => (
                  <button key={x.fy} onClick={() => setFyPick(x.fy)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${fyPick === x.fy ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted hover:text-content'}`}>FY {x.fy}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {[
                { l: 'Sales', v: fy.count, raw: true },
                { l: 'Short-term gain', v: fy.st },
                { l: 'Long-term gain', v: fy.lt },
                { l: 'Estimated tax (incl. cess)', v: fy.tax, strong: true },
              ].map(c => (
                <div key={c.l} className={`rounded-lg p-2.5 ${c.strong ? 'bg-brand-50' : 'bg-surface-2'}`}>
                  <p className={`text-base font-bold tabular ${c.strong ? 'text-brand-700' : 'text-content'}`}>{c.raw ? c.v : formatCurrency(c.v)}</p>
                  <p className="text-[11px] text-muted">{c.l}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-start text-[11px] text-muted">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>Brokerage and charges paid this year on {label}: {formatCurrency(fy.charges)}. Planning estimate only — each sale's tax allows for losses and the ₹1.25L exemption across your other sales that year; surcharge isn't included and the final figure depends on your full return.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="text-center py-12 text-faint">
              <Receipt size={36} className="mx-auto mb-2" />
              <p className="text-sm">No {label} sold yet</p>
              <p className="text-xs mt-1">Use <b>Sell</b> on a holding above — the sale will appear here with its tax estimate.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-2 border-b">
                  <tr>{['Holding', 'Bought', 'Sold', isLumpType(type) ? 'Closed' : 'Qty @ price', 'Received', 'Profit / loss', 'Est. tax', 'Deposited to', ''].map(h =>
                    <th key={h} className="text-left text-xs font-semibold text-muted uppercase px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sales.map(s => {
                    const isOpen = open === s.id
                    const lots = (() => { try { return JSON.parse(s.chunks_json || '[]') } catch { return [] } })()
                    const hasLong = Number(s.lt_gain) !== 0 && lots.some(l => l.term === 'LONG')
                    const hasShort = lots.some(l => l.term === 'SHORT')
                    return (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-surface-2 cursor-pointer" onClick={() => setOpen(isOpen ? null : s.id)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <ChevronRight size={14} className={`text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                              <div>
                                <p className="text-sm font-medium text-content">{s.title}</p>
                                {s.type === 'SIP' && <div className="flex gap-1.5 mt-0.5"><Badge variant="default">{s.category === 'DEBT' ? 'Debt fund' : 'Equity fund'}</Badge></div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{s.first_buy_date === s.last_buy_date ? fmtDate(s.first_buy_date) : <>{fmtDate(s.first_buy_date)}<br /><span className="text-xs">to {fmtDate(s.last_buy_date)}</span></>}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">{fmtDate(s.sell_date)}<p className="text-[11px] text-faint">held ~{fmtHolding(s.avg_holding_days)}</p></td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap tabular">{isLumpType(s.type) ? <>{num4(s.units)}% of holding</> : <>{num4(s.units)} {s.type === 'METALS' ? 'g ' : ''}× {formatCurrency(s.sell_price)}</>}<p className="text-[11px] text-faint">{formatCurrency(s.gross)} gross</p></td>
                          <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap tabular">{formatCurrency(s.net_proceeds)}<p className="text-[11px] font-normal text-faint">after {formatCurrency(Number(s.brokerage) + Number(s.stt))} charges</p></td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className={`text-sm font-semibold tabular ${classifyGL(s.gain)}`}>{sign(s.gain)}{formatCurrency(s.gain)}</p>
                            <div className="flex gap-1 mt-0.5">{hasShort && <Badge variant="warning">Short</Badge>}{hasLong && <Badge variant="success">Long</Badge>}</div>
                          </td>
                          <td className="px-4 py-3 text-sm tabular whitespace-nowrap">{formatCurrency(s.est_tax)}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">{s.account_name ? <span className="inline-flex items-center gap-1"><Landmark size={12} className="text-faint" />{s.account_name}</span> : <span className="text-faint">—</span>}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {s.can_undo ? <Button size="icon" variant="ghost" onClick={() => undo(s)} title="Undo this sale"><Undo2 size={14} className="text-muted" /></Button> : null}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-surface-2/60">
                            <td colSpan={9} className="px-6 py-4 space-y-3">
                              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                                <div><p className="text-faint text-xs">Cost of the part sold</p><p className="font-semibold tabular">{formatCurrency(s.cost_basis)}</p></div>
                                <div><p className="text-faint text-xs">Sale value</p><p className="font-semibold tabular">{formatCurrency(s.gross)}</p></div>
                                <div><p className="text-faint text-xs">Brokerage &amp; charges</p><p className="font-semibold tabular">{formatCurrency(s.brokerage)}</p></div>
                                {(s.type === 'STOCKS' || s.type === 'SIP') && <div><p className="text-faint text-xs">STT</p><p className="font-semibold tabular">{formatCurrency(s.stt)}</p></div>}
                                <div><p className="text-faint text-xs">Short-term gain</p><p className={`font-semibold tabular ${classifyGL(s.st_gain)}`}>{sign(s.st_gain)}{formatCurrency(s.st_gain)}</p></div>
                                <div><p className="text-faint text-xs">Long-term gain</p><p className={`font-semibold tabular ${classifyGL(s.lt_gain)}`}>{sign(s.lt_gain)}{formatCurrency(s.lt_gain)}</p></div>
                              </div>
                              {lots.length > 0 && (
                                <table className="w-full text-xs">
                                  <thead><tr className="text-faint text-left"><th className="font-medium py-1">Bought</th><th className="font-medium">{isLumpType(s.type) ? '%' : 'Qty'}</th><th className="font-medium">Cost</th><th className="font-medium">Held</th><th className="font-medium">Term</th><th className="font-medium text-right">Gain</th></tr></thead>
                                  <tbody>{lots.map((l, i) => (
                                    <tr key={i} className="border-t border-line">
                                      <td className="py-1.5">{fmtDate(l.date)}</td><td>{num4(l.units)}</td><td>{formatCurrency(l.cost)}</td><td>{fmtHolding(l.days)}</td>
                                      <td><Badge variant={l.term === 'LONG' ? 'success' : 'warning'}>{l.term === 'LONG' ? 'Long' : 'Short'}</Badge></td>
                                      <td className={`text-right ${classifyGL(l.gain)}`}>{sign(l.gain)}{formatCurrency(l.gain)}</td>
                                    </tr>))}</tbody>
                                </table>
                              )}
                              {s.type === 'SIP' && <p className="text-[11px] text-amber-700">SIP gains are an estimate (average cost per unit). Check your fund statement for filing.</p>}
                              {s.notes && <p className="text-xs text-muted italic">📝 {s.notes}</p>}
                              <div className="flex gap-4"><UpdatedAt at={s.created_at} label="Recorded" /></div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
