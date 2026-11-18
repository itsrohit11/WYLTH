import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './ui/Modal'
import { Input, Select, Textarea } from './ui/Input'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { formatCurrency, localToday, fmtDate, fmtHolding } from '../lib/utils'
import { AlertTriangle, Info, Landmark } from 'lucide-react'
import toast from 'react-hot-toast'

const n = (v) => Number(v) || 0
const num4 = (v) => String(+n(v).toFixed(4))

// How each holding type is sold. LOTS = shares bought in lots, FUND = SIP / mutual-fund units,
// UNIT = crypto / metals (quantity x price), LUMP = FD, bonds, PPF, NPS, property, other (a share of
// the holding for the amount received).
const modeOf = (t) => t === 'STOCKS' ? 'LOTS' : t === 'SIP' ? 'FUND' : (t === 'CRYPTO' || t === 'METALS') ? 'UNIT' : 'LUMP'
const WORDS = {
  STOCKS: { verb: 'Sell', unit: 'shares', one: 'share', qty: 'Shares to sell', price: 'Sell price / share (₹)', confirm: 'Confirm sale' },
  SIP: { verb: 'Redeem', unit: 'units', one: 'unit', qty: 'Units to redeem', price: 'Redemption NAV (₹)', confirm: 'Confirm redemption' },
  CRYPTO: { verb: 'Sell', unit: 'units', one: 'unit', qty: 'Quantity to sell', price: 'Sell price / unit (₹)', confirm: 'Confirm sale' },
  METALS: { verb: 'Sell', unit: 'g', one: 'g', qty: 'Weight to sell (grams)', price: 'Sell price / g (₹)', confirm: 'Confirm sale' },
}
const LUMP_VERB = { FD: 'Close', BONDS: 'Sell', PPF: 'Withdraw from', NPS: 'Withdraw from', REAL_ESTATE: 'Sell', OTHER: 'Sell' }
const LUMP_CONFIRM = { FD: 'Confirm closure', BONDS: 'Confirm sale', PPF: 'Confirm withdrawal', NPS: 'Confirm withdrawal', REAL_ESTATE: 'Confirm sale', OTHER: 'Confirm sale' }
// Tax bucket that needs the user's slab rate (mirrors the backend)
const slabTypes = ['FD', 'BONDS', 'OTHER', 'METALS', 'REAL_ESTATE']

// Sell any holding. Everything on screen comes from the backend's sale:preview (same maths
// that sale:execute uses), so what you see is what gets recorded.
export default function SellModal({ inv, onClose, onDone }) {
  const mode = modeOf(inv.type)
  const isStock = mode === 'LOTS'
  const isFund = mode === 'FUND'
  const isLump = mode === 'LUMP'
  const W = WORDS[inv.type] || { verb: LUMP_VERB[inv.type] || 'Sell', confirm: LUMP_CONFIRM[inv.type] || 'Confirm sale', unit: 'units', one: 'unit' }
  const typeLabel = String(inv.type).replace('_', ' ').toLowerCase()
  const heldKnown = isLump ? 100 : n(inv.units)
  const [f, setF] = useState({
    units: heldKnown > 0 ? String(heldKnown) : '',
    amount: isLump ? String(Math.round((n(inv.current_value) || n(inv.invested_amount)) * 100) / 100) : '',
    held_units: '',
    price: inv.current_price ? String(inv.current_price) : '',
    date: localToday(),
    brokerage: '',
    stt: '',
    category: inv.fund_category === 'DEBT' ? 'DEBT' : 'EQUITY',
    slab_rate: '30',
    account_id: '',
    notes: '',
  })
  const [sttTouched, setSttTouched] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const s = (k, v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    window.api.bank.getAll().then(a => {
      setAccounts(a || [])
      const pref = (a || []).find(x => x.purpose === 'SAVINGS') || (a || [])[0]
      if (pref) s('account_id', String(pref.id))
    }).catch(() => {})
  }, [])

  // Live preview (debounced) — recalculated whenever an input changes.
  const payload = useMemo(() => ({
    investment_id: inv.id, units: f.units, price: f.price, amount: f.amount, date: f.date, brokerage: f.brokerage,
    stt: sttTouched ? f.stt : '', category: f.category, slab_rate: f.slab_rate, held_units: f.held_units,
  }), [inv.id, f.units, f.price, f.amount, f.date, f.brokerage, f.stt, f.category, f.slab_rate, f.held_units, sttTouched])

  useEffect(() => {
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const r = await window.api.sale.preview(payload).catch(e => ({ ok: false, error: e.message }))
      if (mine === seq.current) setPlan(r)
    }, 250)
    return () => clearTimeout(t)
  }, [payload])

  const ready = plan && plan.ok
  const heldDisplay = ready ? plan.held : heldKnown
  const sellAll = () => s('units', isLump ? '100' : String(heldDisplay || heldKnown))
  const needsSlab = isFund ? f.category === 'DEBT' : slabTypes.includes(inv.type)

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    const r = await window.api.sale.execute({ ...payload, account_id: f.account_id || null, notes: f.notes }).catch(err => ({ ok: false, error: err.message }))
    setBusy(false)
    if (!r.ok) { toast.error(r.error || 'Could not record the sale'); return }
    const acc = accounts.find(a => String(a.id) === f.account_id)
    toast.success(acc ? `Sold — ${formatCurrency(plan.netProceeds)} credited to ${acc.name}` : 'Sale recorded')
    onDone && onDone()
    onClose()
  }

  const gainCls = (v) => (v >= 0 ? 'text-green-600' : 'text-red-600')
  const sign = (v) => (v >= 0 ? '+' : '')
  const ex = plan?.fyAfter

  return (
    <Modal open onClose={onClose} title={`${W.verb} — ${inv.title}`} size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm bg-surface-2 rounded-lg px-3 py-2">
          {isLump
            ? <span className="text-muted">Holding value <b className="text-content tabular">{formatCurrency(n(inv.current_value) || n(inv.invested_amount))}</b></span>
            : <span className="text-muted">You hold <b className="text-content tabular">{num4(heldDisplay)}</b> {W.unit}</span>}
          <span className="text-muted">Invested <b className="text-content tabular">{formatCurrency(inv.invested_amount)}</b></span>
          {ready && !isLump && <span className="text-muted">Avg cost <b className="text-content tabular">{formatCurrency(plan.avgCost)}</b>/{W.one}</span>}
          {n(inv.sold_units) > 0 && <span className="text-faint">{isLump ? 'Part of this was closed earlier' : `Already sold ${num4(inv.sold_units)} earlier`}</span>}
        </div>

        {/* ---------- inputs ---------- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLump ? (
            <>
              <div>
                <Input label="Share of holding (%)" type="number" step="any" min={0} max={100} value={f.units} onChange={e => s('units', e.target.value)} required autoFocus />
                <button type="button" onClick={sellAll} className="text-[11px] text-brand-600 hover:underline mt-1">All of it (100%)</button>
              </div>
              <Input label="Amount received (₹)" type="number" step="any" min={0} value={f.amount} onChange={e => s('amount', e.target.value)} required />
            </>
          ) : (
            <>
              <div>
                <Input label={W.qty} type="number" step="any" value={f.units} onChange={e => s('units', e.target.value)} required autoFocus />
                <button type="button" onClick={sellAll} className="text-[11px] text-brand-600 hover:underline mt-1">{isStock ? 'Sell all' : 'All of it'}</button>
              </div>
              <Input label={W.price} type="number" step="any" value={f.price} onChange={e => s('price', e.target.value)} required />
            </>
          )}
          <Input label={isStock || isFund ? 'Sell date' : 'Date'} type="date" value={f.date} onChange={e => s('date', e.target.value)} required />
          <Input label={isLump ? 'Charges / penalty (₹)' : 'Brokerage & charges (₹)'} type="number" step="any" min={0} value={f.brokerage} onChange={e => s('brokerage', e.target.value)} placeholder={isLump ? 'e.g. premature closure penalty' : "from your broker's contract note"} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(isStock || isFund) && (
            <div>
              <Input label="STT (₹)" type="number" step="any" min={0}
                value={sttTouched ? f.stt : (ready ? String(plan.stt) : '')}
                onChange={e => { setSttTouched(true); s('stt', e.target.value) }} />
              <p className="text-[11px] text-faint mt-1">{sttTouched ? <button type="button" className="text-brand-600 hover:underline" onClick={() => { setSttTouched(false); s('stt', '') }}>Use auto estimate</button> : 'Auto-estimated · edit if different'}</p>
            </div>
          )}
          {isFund && (
            <>
              <Select label="Fund type (for tax)" value={f.category} onChange={e => s('category', e.target.value)}>
                <option value="EQUITY">Equity-oriented (&gt;65% equity)</option>
                <option value="DEBT">Debt / other fund</option>
              </Select>
              {!(heldKnown > 0) && (
                <Input label="Total units you hold" type="number" step="any" value={f.held_units} onChange={e => s('held_units', e.target.value)} placeholder="from your fund statement" required />
              )}
            </>
          )}
          {needsSlab && <Input label="Your tax slab (%)" type="number" step="any" min={0} max={40} value={f.slab_rate} onChange={e => s('slab_rate', e.target.value)} />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Select label="Deposit the sale amount into" value={f.account_id} onChange={e => s('account_id', e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` — ${a.bank}` : ''} · {formatCurrency(a.balance)}</option>)}
              <option value="">Don't credit any account</option>
            </Select>
            {accounts.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No bank accounts yet — add one in Bank Accounts to receive the money.</p>}
          </div>
          <Textarea label="Notes (optional)" value={f.notes} onChange={e => s('notes', e.target.value)} rows={2} />
        </div>

        {/* ---------- live preview ---------- */}
        {plan && !plan.ok && plan.error && (
          <div className="flex gap-2 items-start text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {plan.error}
          </div>
        )}

        {ready && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {[
                { l: 'Bought', v: plan.firstBuy === plan.lastBuy ? fmtDate(plan.firstBuy) : `${fmtDate(plan.firstBuy)} → ${fmtDate(plan.lastBuy)}`, small: true },
                { l: 'Sold on', v: fmtDate(plan.sellDate), small: true },
                { l: 'Avg holding', v: fmtHolding(plan.avgHoldingDays), small: true },
                { l: 'Left after sale', v: plan.fullySold ? 'Nothing (all sold)' : isLump ? `${num4(plan.remainingUnits)}% of holding` : `${num4(plan.remainingUnits)} ${W.unit}`, small: true },
              ].map(c => (
                <div key={c.l} className="bg-surface-2 rounded-lg p-2.5">
                  <p className="text-[11px] text-muted">{c.l}</p>
                  <p className="text-sm font-semibold text-content">{c.v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-line p-3 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Settlement</p>
                <Row l={isLump ? 'Amount received' : `Sale value (${num4(plan.units)} × ${formatCurrency(plan.price)})`} v={formatCurrency(plan.gross)} />
                <Row l="− Brokerage & charges" v={`− ${formatCurrency(plan.brokerage)}`} muted />
                {(isStock || isFund) && <Row l="− STT" v={`− ${formatCurrency(plan.stt)}`} muted />}
                <div className="border-t border-line pt-1.5"><Row l={<b>Amount credited to your account</b>} v={<b className="text-content">{formatCurrency(plan.netProceeds)}</b>} /></div>
                <p className="text-[11px] text-faint">Estimated tax is not deducted — you pay it when you file (advance tax / ITR).</p>
              </div>

              <div className="rounded-xl border border-line p-3 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Profit / loss</p>
                <Row l={isLump ? 'Cost of the part closed' : `Cost of ${W.unit} sold`} v={formatCurrency(plan.costBasis)} />
                <Row l={isLump ? 'Received − charges' : 'Sale value − brokerage'} v={formatCurrency(plan.gross - plan.brokerage)} muted />
                <div className="border-t border-line pt-1.5">
                  <Row l={<b>Capital gain</b>} v={<b className={gainCls(plan.gain)}>{sign(plan.gain)}{formatCurrency(plan.gain)}</b>} />
                </div>
                {plan.stCost > 0 && plan.category !== 'CRYPTO' && <Row l={<span>Short-term <span className="text-faint">(≤ {plan.category === 'LT24' ? 24 : 12} months)</span></span>} v={<span className={gainCls(plan.stGain)}>{sign(plan.stGain)}{formatCurrency(plan.stGain)}</span>} />}
                {plan.ltCost > 0 && plan.category !== 'CRYPTO' && <Row l={<span>Long-term <span className="text-faint">(&gt; {plan.category === 'LT24' ? 24 : 12} months)</span></span>} v={<span className={gainCls(plan.ltGain)}>{sign(plan.ltGain)}{formatCurrency(plan.ltGain)}</span>} />}
              </div>
            </div>

            {/* Tax box */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-brand-900">Estimated tax on this sale · FY {plan.fy}</p>
                <p className="text-xl font-bold text-brand-700 tabular">{formatCurrency(plan.taxAdded)}</p>
              </div>
              <ul className="text-xs text-muted space-y-1 list-disc pl-4">
                {plan.category === 'DEBT' ? (
                  isFund
                    ? <li>Debt / non-equity funds bought after 1 Apr 2023 are taxed at your <b>income-tax slab rate ({plan.slabRate}%)</b> whatever the holding period.</li>
                    : <li>The gain (interest or profit) on this holding is taxed at your <b>income-tax slab rate ({plan.slabRate}%)</b>. For an FD, interest may already have had TDS cut by the bank.</li>
                ) : plan.category === 'CRYPTO' ? (
                  <>
                    <li>Crypto / virtual digital assets: <b>flat 30%</b> on the gain, whatever the holding period.</li>
                    <li>Losses on crypto <b>cannot</b> be set off against any other income or carried forward. Exchanges may also deduct 1% TDS (not modelled here).</li>
                  </>
                ) : plan.category === 'LT24' ? (
                  <>
                    <li><b>Held 24 months or less</b>: gain taxed at your slab rate ({plan.slabRate}%).</li>
                    <li><b>Held more than 24 months</b>: <b>12.5%</b> on the gain, without indexation and without the ₹1.25L equity exemption.</li>
                  </>
                ) : plan.category === 'EXEMPT' ? (
                  <li>{inv.type === 'PPF' ? 'PPF maturity and withdrawals are tax-free.' : 'NPS: the lump-sum part (up to 60%) is tax-free; the rest must buy an annuity, which is taxed as income. No tax is estimated here.'}</li>
                ) : (
                  <>
                    <li><b>Short-term</b> (held 12 months or less): <b>20%</b> on the gain.</li>
                    <li><b>Long-term</b> (held more than 12 months): <b>12.5%</b> on gains above <b>{formatCurrency(plan.rules.LTCG_EXEMPTION)}</b> in the financial year — no indexation.</li>
                  </>
                )}
                <li>+ <b>4% health &amp; education cess</b> on the tax. Surcharge for very high incomes is not included.</li>
                {(isStock || isFund) && <li>Brokerage reduces your gain. STT does <b>not</b> (it only reduces the cash you receive).</li>}
                {plan.category === 'EQUITY' && ex && (
                  <li>LTCG exemption used this FY: {formatCurrency(plan.fyBefore.exemptionUsed)} → <b>{formatCurrency(ex.exemptionUsed)}</b> of {formatCurrency(plan.rules.LTCG_EXEMPTION)} ({formatCurrency(ex.exemptionLeft)} left).</li>
                )}
                {(plan.fyBefore.stLosses > 0 || plan.fyBefore.ltLosses > 0) && <li>Losses from your earlier sales this year have been set off against these gains.</li>}
                {plan.gain < 0 && plan.category !== 'CRYPTO' && plan.category !== 'EXEMPT' && <li>This is a <b>loss</b> — it can be set off against other gains this year and carried forward (file your ITR on time).</li>}
              </ul>
              {plan.isEstimate && (
                <div className="flex gap-2 items-start text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  {isLump
                    ? <span>This is an <b>estimate</b>: the whole holding is treated as bought on {fmtDate(inv.date)}. Check the exact tax treatment for your case before filing.</span>
                    : <span>SIP figures are an <b>estimate</b>: your average cost per unit is used and each instalment is assumed to be on the {inv.auto_day ? `${inv.auto_day}th` : 'start date\'s day'} of its month. Your fund house's capital-gains statement (CAS) has the exact numbers for filing.</span>}
                </div>
              )}
              <p className="text-[11px] text-faint">Rates as of FY 2026-27 (Income-tax Act, 2025). This is a planning estimate, not tax advice.</p>
            </div>

            {plan.rows.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-brand-600 select-none">How the {plan.rows.length} purchase lots were matched (oldest first)</summary>
                <table className="w-full mt-2">
                  <thead><tr className="text-faint text-left"><th className="font-medium py-1">Bought</th><th className="font-medium">{isStock ? 'Shares' : isLump ? '% sold' : 'Units'}</th><th className="font-medium">Cost</th><th className="font-medium">Held</th><th className="font-medium">Term</th><th className="font-medium text-right">Gain</th></tr></thead>
                  <tbody>
                    {plan.rows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1">{fmtDate(r.date)}</td><td>{num4(r.units)}</td><td>{formatCurrency(r.cost)}</td><td>{fmtHolding(r.days)}</td>
                        <td><Badge variant={r.term === 'LONG' ? 'success' : 'warning'}>{r.term === 'LONG' ? 'Long' : 'Short'}</Badge></td>
                        <td className={`text-right ${gainCls(r.gain)}`}>{sign(r.gain)}{formatCurrency(r.gain)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-faint flex items-center gap-1">
            {f.account_id && ready ? <><Landmark size={12} /> {formatCurrency(plan.netProceeds)} will show on that account's statement</> : null}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!ready} loading={busy}>{W.confirm}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function Row({ l, v, muted }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={muted ? 'text-muted' : 'text-content'}>{l}</span>
      <span className="tabular">{v}</span>
    </div>
  )
}
