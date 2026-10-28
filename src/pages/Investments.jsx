import { useEffect, useState, Fragment } from 'react'
import { useInvestmentStore } from '../stores/investmentStore'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, classifyGL, INVESTMENT_TYPES } from '../lib/utils'
import { useDnd } from '../lib/useDnd'
import SellModal from '../components/SellModal'
import SoldSection from '../components/SoldSection'
import { UpdatedAt } from '../components/ui/UpdatedAt'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, ChevronRight, GripVertical, BadgeIndianRupee } from 'lucide-react'

// Each investment type shows the inputs that actually matter for it.
// mode 'unit' = quantity x price (stocks, crypto, gold); 'lump' = a single amount (FD, PPF, NPS, property);
// 'sip' = a monthly amount across a start->end month range.
const TYPE_FIELDS = {
  STOCKS:      { name:'Stock / Company Name', mode:'unit', unitLabel:'No. of Shares',  buyLabel:'Buy Price / Share (₹)', curLabel:'Current Price / Share (₹)', platform:'Broker',       dateLabel:'Purchase Date' },
  SIP:         { name:'SIP / Fund Name',      mode:'sip',  platform:'Platform' },
  CRYPTO:      { name:'Coin / Token',         mode:'unit', unitLabel:'Quantity',       buyLabel:'Buy Price (₹)',         curLabel:'Current Price (₹)',         platform:'Exchange',     dateLabel:'Purchase Date' },
  METALS:      { name:'Metal',                mode:'unit', unitLabel:'Weight (grams)', buyLabel:'Buy Price / g (₹)',     curLabel:'Current Price / g (₹)',     platform:null,           dateLabel:'Purchase Date', metals:true },
  FD:          { name:'Bank Name',            mode:'lump', amtLabel:'Principal (₹)',         curValLabel:'Maturity / Current Value (₹)', rate:'Interest Rate (% p.a.)', platform:null,        dateLabel:'Start Date' },
  BONDS:       { name:'Bond Name / Issuer',   mode:'lump', amtLabel:'Amount Invested (₹)',     curValLabel:'Current / Maturity Value (₹)', rate:'Coupon / Interest Rate (%)', platform:'Platform / Broker', dateLabel:'Purchase Date', maturity:true, ratePeriod:true },
  PPF:         { name:'Institution',          mode:'lump', amtLabel:'Total Deposited (₹)',   curValLabel:'Current Balance (₹)',          rate:'Interest Rate (% p.a.)', platform:null,        dateLabel:'Opened On' },
  NPS:         { name:'Provider / PRAN',      mode:'lump', amtLabel:'Total Contributed (₹)', curValLabel:'Current Value (₹)',            platform:'Fund Manager',       dateLabel:'Start Date' },
  REAL_ESTATE: { name:'Property / Location',  mode:'lump', amtLabel:'Purchase Price (₹)',    curValLabel:'Current Market Value (₹)',     platform:null,                 dateLabel:'Purchase Date' },
  OTHER:       { name:'Investment Name',      mode:'lump', amtLabel:'Amount Invested (₹)',   curValLabel:'Current Value (₹)',            platform:null,                 dateLabel:'Date' },
}

// SIP helpers (mirror the backend math for a live preview).
const ymOf = (d) => d ? String(d).slice(0,7) : ''
const sipMonths = (startYM, endYM) => {
  if (!startYM || !endYM) return 0
  const [sy,sm] = startYM.split('-').map(Number), [ey,em] = endYM.split('-').map(Number)
  if (!sy||!sm||!ey||!em) return 0
  const n = (ey-sy)*12 + (em-sm) + 1
  return n>0 ? n : 0
}
// whole months between two full dates (bond tenure)
const monthsToDate = (a,b) => {
  if (!a || !b) return 0
  const d1 = new Date(a), d2 = new Date(b)
  if (isNaN(d1) || isNaN(d2)) return 0
  const m = (d2.getFullYear()-d1.getFullYear())*12 + (d2.getMonth()-d1.getMonth())
  return m > 0 ? m : 0
}
const sipFV = (P, annualPct, months) => {
  if (months<=0 || !P) return 0
  const i = (annualPct||0)/100/12
  return i===0 ? P*months : P*((Math.pow(1+i,months)-1)/i)*(1+i)
}

function InvestmentForm({ initial, onSave, onClose }) {
  const initType = initial?.type || 'SIP'
  const [f, setF] = useState(initial ? {
    title:initial.title||'', type:initType,
    invested_amount:initial.invested_amount??'', current_value:initial.current_value??'',
    units:initial.units??'', purchase_price:initial.purchase_price??'', current_price:initial.current_price??'',
    interest_rate:initial.interest_rate??'', platform:initial.platform||'',
    date:initial.date||new Date().toISOString().split('T')[0], notes:initial.notes||'',
    sip_amount:initial.sip_amount??'',
    sip_mode: initial.sip_mode || 'MONTHLY',
    maturity_date: initial.maturity_date || '',
    rate_period: initial.rate_period || 'YEARLY',
    sip_start: initType==='SIP' ? ymOf(initial.date) : '',
    sip_end: ymOf(initial.sip_end),
    gain_pct: (initType==='SIP' && initial.invested_amount>0)
      ? Number((((initial.current_value - initial.invested_amount)/initial.invested_amount)*100).toFixed(2)) : '',
    auto_amount: initial.auto_amount ?? '', auto_day: initial.auto_day ?? '',
    metal: initType==='METALS' ? (['Gold','Silver'].includes(initial.title) ? initial.title : 'Other') : 'Gold',
    metalName: (initType==='METALS' && !['Gold','Silver'].includes(initial.title)) ? (initial.title||'') : '',
  } : {
    title:'', type:'SIP', invested_amount:'', current_value:'', units:'', purchase_price:'',
    current_price:'', interest_rate:'', platform:'', date:new Date().toISOString().split('T')[0], notes:'',
    sip_amount:'', sip_mode:'MONTHLY', maturity_date:'', rate_period:'YEARLY', sip_start:ymOf(new Date().toISOString()), sip_end:'', gain_pct:'',
    auto_amount:'', auto_day:'', metal:'Gold', metalName:'',
  })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const cfg = TYPE_FIELDS[f.type] || TYPE_FIELDS.OTHER

  const u = Number(f.units)||0, bp = Number(f.purchase_price)||0, cp = Number(f.current_price)||0
  const sipAmt = Number(f.sip_amount)||0
  // Invested so far is based on the current month (end month is only a target reminder).
  const nowYM = ymOf(new Date().toISOString())
  const effEnd = !f.sip_end ? nowYM : (f.sip_end <= nowYM ? f.sip_end : nowYM)
  const months = sipMonths(f.sip_start, effEnd)             // installments paid so far
  const plannedMonths = sipMonths(f.sip_start, f.sip_end)   // full plan, only for projection
  const isLump = cfg.mode==='sip' && f.sip_mode==='LUMPSUM'
  const sipInvested = isLump ? sipAmt : sipAmt * months     // lumpsum never multiplies by months
  const sipCurrent = sipInvested * (1 + (Number(f.gain_pct)||0)/100)
  const lumpYears = plannedMonths/12
  const sipProjected = isLump
    ? (lumpYears>0 ? sipAmt*Math.pow(1+(Number(f.interest_rate)||0)/100, lumpYears) : 0)
    : sipFV(sipAmt, Number(f.interest_rate)||0, plannedMonths)
  const plannedInvested = isLump ? sipAmt : sipAmt*plannedMonths

  // Bonds: the rate may be per month (short-term) or per year — work from the monthly rate.
  const bondP = Number(f.invested_amount)||0
  const bondPct = Number(f.interest_rate)||0
  const bondMonthlyRate = f.rate_period==='MONTHLY' ? bondPct/100 : bondPct/100/12
  const bondMonths = monthsToDate(f.date, f.maturity_date)
  const bondIntPM = bondP * bondMonthlyRate
  const bondTotalInt = bondIntPM * bondMonths
  const bondMaturityVal = bondP + bondTotalInt

  const invested = cfg.mode==='sip' ? sipInvested : cfg.mode==='unit' ? u*bp : Number(f.invested_amount)||0
  const current  = cfg.mode==='sip' ? sipCurrent  : cfg.mode==='unit' ? (cp>0 ? u*cp : u*bp) : (Number(f.current_value) || Number(f.invested_amount) || 0)
  const gl = current - invested

  const submit=async(e)=>{
    e.preventDefault()
    const isSip = cfg.mode==='sip'
    const title = cfg.metals ? (f.metal==='Other' ? (f.metalName||'Metal') : f.metal) : f.title
    await onSave({
      title, type:f.type, notes:f.notes,
      date: isSip ? (f.sip_start ? f.sip_start+'-01' : f.date) : f.date,
      invested_amount: invested,
      current_value: current,
      units:          cfg.mode==='unit' ? (Number(f.units)||null) : null,
      purchase_price: cfg.mode==='unit' ? (Number(f.purchase_price)||null) : null,
      current_price:  cfg.mode==='unit' ? (Number(f.current_price)||null) : null,
      interest_rate:  (cfg.rate || isSip) ? (Number(f.interest_rate)||null) : null,
      sip_amount:     isSip ? (sipAmt||null) : null,
      sip_end:        isSip ? (f.sip_end ? f.sip_end+'-01' : null) : null,
      sip_gain_pct:   isSip ? (f.gain_pct===''||f.gain_pct==null ? null : Number(f.gain_pct)) : null,
      sip_mode:       isSip ? (f.sip_mode==='LUMPSUM' ? 'LUMPSUM' : 'MONTHLY') : null,
      maturity_date:  cfg.maturity ? (f.maturity_date||null) : null,
      rate_period:    cfg.ratePeriod ? (f.rate_period==='MONTHLY'?'MONTHLY':'YEARLY') : 'YEARLY',
      auto_amount:    cfg.mode==='lump' ? (Number(f.auto_amount)||null) : null,
      auto_day:       isLump ? null : ((isSip || cfg.mode==='lump') ? (Number(f.auto_day)||null) : null),
      platform:       cfg.platform ? (f.platform||null) : null,
    })
    onClose()
  }

  const extraCols = ((cfg.rate && !cfg.ratePeriod)?1:0) + (cfg.platform?1:0) + 1 // + date
  return (
    <form onSubmit={submit} className="space-y-4">
      {cfg.metals ? (
        <div className="grid grid-cols-2 gap-3">
          <Select label="Metal" value={f.metal} onChange={e=>s('metal',e.target.value)}>
            {['Gold','Silver','Other'].map(m=><option key={m} value={m}>{m}</option>)}
          </Select>
          {f.metal==='Other' && <Input label="Metal name" value={f.metalName} onChange={e=>s('metalName',e.target.value)} placeholder="e.g. Platinum" required/>}
        </div>
      ) : (
        <Input label={cfg.name} value={f.title} onChange={e=>s('title',e.target.value)} required/>
      )}
      <Select label="Type" value={f.type} onChange={e=>s('type',e.target.value)}>
        {INVESTMENT_TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
      </Select>

      {cfg.mode==='sip' ? (
        <>
          {/* Monthly plan or a one-time lumpsum — every calculation below follows this choice. */}
          <div className="flex gap-2">
            <button type="button" onClick={()=>s('sip_mode','MONTHLY')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!isLump?'bg-brand-600 text-white':'bg-surface-2 text-muted hover:text-content'}`}>Monthly SIP</button>
            <button type="button" onClick={()=>s('sip_mode','LUMPSUM')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${isLump?'bg-brand-600 text-white':'bg-surface-2 text-muted hover:text-content'}`}>Lumpsum (one-time)</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={isLump?'Amount Invested (₹)':'Monthly Amount (₹)'} type="number" step="any" value={f.sip_amount} onChange={e=>s('sip_amount',e.target.value)} required/>
            <Input label={isLump?'Invested In':'Start Month'} type="month" value={f.sip_start} onChange={e=>s('sip_start',e.target.value)} required/>
            <Input label={isLump?'Target Month (optional)':'End Month (target)'} type="month" value={f.sip_end} onChange={e=>s('sip_end',e.target.value)}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Expected Annual Return %" type="number" step="any" value={f.interest_rate} onChange={e=>s('interest_rate',e.target.value)} placeholder="for projection, e.g. 12"/>
            <Input label="Gain / Loss % so far" type="number" step="any" value={f.gain_pct} onChange={e=>s('gain_pct',e.target.value)} placeholder="e.g. 12 or -5"/>
          </div>
          <p className="text-[11px] text-faint -mt-2">
            {isLump
              ? <>A lumpsum is invested <b>once</b> — the amount stays fixed and never grows month by month. The target month is only used to project its value.</>
              : <>End month is just a target reminder — your <b>invested amount is based on months completed up to now</b>, and updates automatically each month.</>}
          </p>
          {!isLump && <Input label="Auto-invest day of month (1-31, optional)" type="number" min={1} max={31} value={f.auto_day} onChange={e=>s('auto_day',e.target.value)} placeholder="get a monthly reminder, e.g. 5"/>}
          {cfg.platform && <Input label={cfg.platform} value={f.platform} onChange={e=>s('platform',e.target.value)} placeholder="optional"/>}
          <div className={`grid ${isLump?'grid-cols-3':'grid-cols-4'} gap-3 bg-surface-2 rounded-lg p-3 text-center`}>
            {!isLump && <div><p className="text-xs text-muted">Months so far</p><p className="text-sm font-semibold">{months}</p></div>}
            <div><p className="text-xs text-muted">Invested</p><p className="text-sm font-semibold">{formatCurrency(invested)}</p></div>
            <div><p className="text-xs text-muted">Current</p><p className="text-sm font-semibold">{formatCurrency(current)}</p></div>
            <div><p className="text-xs text-muted">P&L</p><p className={`text-sm font-semibold ${gl>=0?'text-[#15803D] dark:text-[#4ADE80]':'text-[#B91C1C] dark:text-[#FF6B6B]'}`}>{gl>=0?'+':''}{formatCurrency(gl)}</p></div>
          </div>
          {Number(f.interest_rate)>0 && plannedMonths>0 && (
            <div className="text-xs text-brand-600 -mt-1">Projected {isLump?'value':'maturity'} ({isLump?`${lumpYears.toFixed(1)} yr`:`${plannedMonths} mo`} @ {f.interest_rate}% p.a.): <span className="font-semibold">{formatCurrency(sipProjected)}</span> ({sipProjected-plannedInvested>=0?'+':''}{formatCurrency(sipProjected-plannedInvested)})</div>
          )}
        </>
      ) : cfg.mode==='unit' ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Input label={cfg.unitLabel} type="number" step="any" value={f.units} onChange={e=>s('units',e.target.value)} required/>
            <Input label={cfg.buyLabel} type="number" step="any" value={f.purchase_price} onChange={e=>s('purchase_price',e.target.value)} required/>
            <Input label={cfg.curLabel} type="number" step="any" value={f.current_price} onChange={e=>s('current_price',e.target.value)}/>
          </div>
          <div className="grid grid-cols-3 gap-3 bg-surface-2 rounded-lg p-3 text-center">
            <div><p className="text-xs text-muted">Invested</p><p className="text-sm font-semibold">{formatCurrency(invested)}</p></div>
            <div><p className="text-xs text-muted">Current Value</p><p className="text-sm font-semibold">{formatCurrency(current)}</p></div>
            <div><p className="text-xs text-muted">P&L</p><p className={`text-sm font-semibold ${gl>=0?'text-[#15803D] dark:text-[#4ADE80]':'text-[#B91C1C] dark:text-[#FF6B6B]'}`}>{gl>=0?'+':''}{formatCurrency(gl)}</p></div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input label={cfg.amtLabel} type="number" step="any" value={f.invested_amount} onChange={e=>s('invested_amount',e.target.value)} required/>
            <Input label={cfg.curValLabel} type="number" step="any" value={f.current_value} onChange={e=>s('current_value',e.target.value)}/>
          </div>
          <div className="bg-brand-50/50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-brand-900">Monthly contribution (optional) — e.g. PF / PPF / NPS</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amount / month (₹)" type="number" step="any" value={f.auto_amount} onChange={e=>s('auto_amount',e.target.value)} placeholder="e.g. 5000"/>
              <Input label="On day of month (1-31)" type="number" min={1} max={31} value={f.auto_day} onChange={e=>s('auto_day',e.target.value)} placeholder="e.g. 1"/>
            </div>
            <p className="text-[11px] text-muted">On this day each month you'll get a notification — Accept adds the amount to invested &amp; current value.</p>
          </div>
        </>
      )}

      {cfg.ratePeriod && (
        <div className="grid grid-cols-2 gap-3">
          <Input label={cfg.rate} type="number" step="any" value={f.interest_rate} onChange={e=>s('interest_rate',e.target.value)} placeholder={f.rate_period==='MONTHLY'?'e.g. 1.2':'e.g. 9'}/>
          <Select label="Rate is" value={f.rate_period} onChange={e=>s('rate_period',e.target.value)}>
            <option value="YEARLY">% per year (p.a.)</option>
            <option value="MONTHLY">% per month</option>
          </Select>
        </div>
      )}
      {cfg.mode!=='sip' && (
        <div className={`grid gap-3 ${extraCols===3?'grid-cols-3':extraCols===2?'grid-cols-2':'grid-cols-1'}`}>
          {cfg.rate && !cfg.ratePeriod && <Input label={cfg.rate} type="number" step="any" value={f.interest_rate} onChange={e=>s('interest_rate',e.target.value)}/>}
          {cfg.platform && <Input label={cfg.platform} value={f.platform} onChange={e=>s('platform',e.target.value)} placeholder="optional"/>}
          <Input label={cfg.dateLabel} type="date" value={f.date} onChange={e=>s('date',e.target.value)}/>
        </div>
      )}

      {cfg.maturity && (
        <Input label="Maturity Date (optional)" type="date" value={f.maturity_date} onChange={e=>s('maturity_date',e.target.value)}/>
      )}
      {cfg.ratePeriod && bondP>0 && bondPct>0 && bondMonths>0 && (
        <>
          <div className="grid grid-cols-4 gap-3 bg-surface-2 rounded-lg p-3 text-center">
            <div><p className="text-xs text-muted">Months to maturity</p><p className="text-sm font-semibold">{bondMonths}</p></div>
            <div><p className="text-xs text-muted">Interest / month</p><p className="text-sm font-semibold">{formatCurrency(bondIntPM)}</p></div>
            <div><p className="text-xs text-muted">Total interest</p><p className="text-sm font-semibold text-[#15803D] dark:text-[#4ADE80]">{formatCurrency(bondTotalInt)}</p></div>
            <div><p className="text-xs text-muted">At maturity</p><p className="text-sm font-semibold">{formatCurrency(bondMaturityVal)}</p></div>
          </div>
          <p className="text-[11px] text-faint -mt-2">
            {f.rate_period==='MONTHLY'
              ? <>{bondPct}% per month is about <b>{(bondPct*12).toFixed(2)}% a year</b>.</>
              : <>{bondPct}% a year is about <b>{(bondPct/12).toFixed(3)}% a month</b>.</>}
            {' '}Interest is shown simple — coupons paid out to you, not reinvested.
          </p>
        </>
      )}

      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Add'} Investment</Button>
      </div>
    </form>
  )
}

function StockLotForm({ inv, onSave, onClose }) {
  const [f, setF] = useState({ units:'', price:'', date:new Date().toISOString().split('T')[0] })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); await onSave(inv.id, { units:Number(f.units), price:Number(f.price), date:f.date }); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Add another purchase of <b>{inv.title}</b> — the average buy price recalculates automatically.</p>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Units" type="number" step="any" value={f.units} onChange={e=>s('units',e.target.value)} required autoFocus/>
        <Input label="Buy Price (₹)" type="number" step="any" value={f.price} onChange={e=>s('price',e.target.value)} required/>
        <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">Add Purchase</Button>
      </div>
    </form>
  )
}

function StockPriceForm({ inv, onSave, onClose }) {
  const [price, setPrice] = useState(inv.current_price ?? '')
  const submit=async(e)=>{ e.preventDefault(); await onSave(inv.id, Number(price)); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Update the current market price of <b>{inv.title}</b> to refresh your P&amp;L.</p>
      <Input label="Current Price (₹)" type="number" step="any" value={price} onChange={e=>setPrice(e.target.value)} required autoFocus/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">Update Price</Button>
      </div>
    </form>
  )
}

// Enter the current NAV and total units held for a SIP → value = units x NAV.
function NavForm({ inv, onSave, onClose }) {
  const [nav, setNav] = useState(inv.current_price ?? '')
  const [units, setUnits] = useState(inv.units ?? '')
  const value = (Number(nav)||0) * (Number(units)||0)
  const gl = value - (Number(inv.invested_amount)||0)
  const submit=async(e)=>{ e.preventDefault(); await onSave(inv.id, Number(nav), Number(units)); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Enter the latest <b>NAV</b> and the total <b>units</b> you hold in <b>{inv.title}</b>. This values the SIP at units × NAV and recalculates your P&amp;L.</p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Current NAV (₹)" type="number" step="any" value={nav} onChange={e=>setNav(e.target.value)} required autoFocus/>
        <Input label="Total units held" type="number" step="any" value={units} onChange={e=>setUnits(e.target.value)} required/>
      </div>
      {value>0 && (
        <div className="grid grid-cols-3 gap-3 bg-surface-2 rounded-lg p-3 text-center">
          <div><p className="text-xs text-muted">Invested</p><p className="text-sm font-semibold">{formatCurrency(inv.invested_amount)}</p></div>
          <div><p className="text-xs text-muted">Value</p><p className="text-sm font-semibold">{formatCurrency(value)}</p></div>
          <div><p className="text-xs text-muted">P&L</p><p className={`text-sm font-semibold ${gl>=0?'text-[#15803D] dark:text-[#4ADE80]':'text-[#B91C1C] dark:text-[#FF6B6B]'}`}>{gl>=0?'+':''}{formatCurrency(gl)}</p></div>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save NAV &amp; Units</Button>
      </div>
    </form>
  )
}

export default function Investments() {
  const { investments, loading, fetchAll, create, update, delete:del } = useInvestmentStore()
  const [modal, setModal] = useState({open:false,item:null})
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [stockOpen, setStockOpen] = useState(null)
  const [lots, setLots] = useState([])
  const [lotModal, setLotModal] = useState({open:false, inv:null, mode:'lot'})
  const [navModal, setNavModal] = useState({open:false, inv:null})
  const [navOpen, setNavOpen] = useState(null)   // SIP id whose NAV history is expanded
  const [navHist, setNavHist] = useState([])
  const [sellInv, setSellInv] = useState(null)       // holding being sold (opens the Sell popup)
  const [soldTick, setSoldTick] = useState(0)        // bumps to reload the Sold section

  useEffect(()=>{ fetchAll() },[])

  const toggleNav = async (inv) => {
    if (navOpen === inv.id) { setNavOpen(null); return }
    setNavOpen(inv.id)
    setNavHist(await window.api.investment.getNavHistory(inv.id))
  }
  const saveNav = async (invId, nav, units) => {
    await window.api.investment.saveNav({ investment_id: invId, nav, units })
    fetchAll()
    if (navOpen === invId) setNavHist(await window.api.investment.getNavHistory(invId))
  }

  const toggleStock = async (inv) => {
    if (stockOpen === inv.id) { setStockOpen(null); return }
    setStockOpen(inv.id)
    setLots(await window.api.investment.getStockPurchases(inv.id))
  }
  const refreshLots = async (invId) => { setLots(await window.api.investment.getStockPurchases(invId)); fetchAll() }
  const addLot = async (invId, d) => { await window.api.investment.addStockPurchase(invId, d.units, d.price, d.date); refreshLots(invId) }
  const delLot = async (lotId, invId) => { await window.api.investment.deleteStockPurchase(lotId, invId); refreshLots(invId) }
  const setPrice = async (invId, price) => { await window.api.investment.updateStockPrice(invId, price); refreshLots(invId) }

  // Fully sold holdings live in the Sold section below, not in the portfolio.
  const live = investments.filter(i=>i.status!=='CLOSED')
  const filtered = typeFilter==='ALL' ? live : live.filter(i=>i.type===typeFilter)
  // Grand totals (whole portfolio) — always shown at the top.
  const grandInvested = live.reduce((s,x)=>s+Number(x.invested_amount),0)
  const grandCurrent  = live.reduce((s,x)=>s+Number(x.current_value),0)
  const grandGL = grandCurrent - grandInvested
  // Selected-type totals — shown only when a type tab is active.
  const typeInvested = filtered.reduce((s,x)=>s+Number(x.invested_amount),0)
  const typeCurrent  = filtered.reduce((s,x)=>s+Number(x.current_value),0)
  const typeGL = typeCurrent - typeInvested
  const typeReturnPct = typeInvested>0 ? (typeGL/typeInvested*100) : 0
  const sipProjectedTotal = filtered.filter(i=>i.type==='SIP').reduce((s,x)=>s+Number(x.projectedValue||0),0)
  const { itemProps } = useDnd(filtered, async (arr) => { await window.api.reorder('investments', arr.map(i => i.id)); fetchAll() })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Investments</h2>
          <p className="text-sm text-muted">Track your portfolio</p></div>
        <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add Investment</Button>
      </div>

      {/* Portfolio totals — always shown */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {label:'Total Invested', value:formatCurrency(grandInvested), cls:'text-brand-600'},
          {label:'Current Value', value:formatCurrency(grandCurrent), cls:'text-content'},
          {label:'Unrealised P&L', value:`${grandGL>=0?'+':''}${formatCurrency(grandGL)}`, cls:grandGL>=0?'text-[#15803D] dark:text-[#4ADE80]':'text-[#B91C1C] dark:text-[#FF6B6B]'},
        ].map(c=>(
          <Card key={c.label}><CardContent className="py-4 text-center">
            <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
            <p className="text-xs text-muted mt-1">{c.label}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Per-type tabs (click an active one again to clear the filter) */}
      <Card>
        <CardContent className="py-3 flex items-center gap-2 flex-wrap">
          {INVESTMENT_TYPES.map(t=>(
            <button key={t} onClick={()=>setTypeFilter(typeFilter===t?'ALL':t)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${typeFilter===t?'bg-brand-600 text-white':'bg-surface-2 text-muted hover:bg-gray-200'}`}>
              {t.replace('_',' ')}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Breakdown for the selected type */}
      {typeFilter!=='ALL' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {label:`${typeFilter.replace('_',' ')} Invested`, value:formatCurrency(typeInvested), cls:'text-brand-600'},
              {label:'Current Value', value:formatCurrency(typeCurrent), cls:'text-content'},
              {label:'P&L', value:`${typeGL>=0?'+':''}${formatCurrency(typeGL)}`, cls:typeGL>=0?'text-[#15803D] dark:text-[#4ADE80]':'text-[#B91C1C] dark:text-[#FF6B6B]'},
              {label:'Return', value:`${typeReturnPct>=0?'+':''}${typeReturnPct.toFixed(2)}%`, cls:typeReturnPct>=0?'text-[#15803D] dark:text-[#4ADE80]':'text-[#B91C1C] dark:text-[#FF6B6B]'},
            ].map(c=>(
              <Card key={c.label}><CardContent className="py-4 text-center">
                <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
                <p className="text-xs text-muted mt-1">{c.label}</p>
              </CardContent></Card>
            ))}
          </div>
          {typeFilter==='SIP' && sipProjectedTotal>0 && (
            <p className="text-xs text-brand-600 -mt-2 text-center">Projected maturity of all SIPs (at their expected returns): <span className="font-semibold">{formatCurrency(sipProjectedTotal)}</span></p>
          )}
        </>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
          : filtered.length===0 ? (
            <div className="text-center py-16 text-faint">
              <TrendingUp size={40} className="mx-auto mb-3 text-faint"/>
              <p>No investments yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-2 border-b">
                  <tr>{['Name','Type','Invested','Current Value','P&L','Date','Actions'].map(h=>
                    <th key={h} className="text-left text-xs font-semibold text-muted uppercase px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((inv, idx)=>{
                    const isStock = inv.type==='STOCKS'
                    const isSip = inv.type==='SIP'
                    const open = stockOpen===inv.id
                    const navExpanded = navOpen===inv.id
                    const expandable = isStock || isSip
                    return (
                    <Fragment key={inv.id}>
                    <tr {...itemProps(idx)} className={`hover:bg-surface-2 transition-colors ${expandable?'cursor-pointer':''}`} onClick={isStock?()=>toggleStock(inv):isSip?()=>toggleNav(inv):undefined}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <GripVertical size={13} className="text-faint cursor-grab shrink-0"/>
                          {expandable && <ChevronRight size={14} className={`text-faint transition-transform ${(isStock?open:navExpanded)?'rotate-90':''}`}/>}
                          <div className="font-medium text-sm text-content">{inv.title}</div>
                        </div>
                        {inv.type==='SIP' ? (
                          <div className="text-xs text-faint ml-5">{inv.isLumpsum ? `Lumpsum ${formatCurrency(inv.invested_amount)}` : `${formatCurrency(inv.sip_amount)}/mo · ${inv.months} mo`}{inv.units>0?` · ${inv.units} units @ ${formatCurrency(inv.current_price)} NAV`:''}{inv.platform?` · ${inv.platform}`:''}</div>
                        ) : isStock ? (
                          <div className="text-xs text-faint ml-5">{inv.units} sh · avg {formatCurrency(inv.avgBuyPrice)} · last {inv.lastTradedDate||inv.date}</div>
                        ) : inv.units ? (
                          <div className="text-xs text-faint">{inv.units} {inv.type==='METALS'?'g':'units'} @ {formatCurrency(inv.purchase_price)}{inv.platform?` · ${inv.platform}`:''}</div>
                        ) : inv.interest_rate ? (
                          <div className="text-xs text-faint">{inv.interest_rate}% {inv.rate_period==='MONTHLY'?'per month':'p.a.'}{inv.monthsToMaturity>0?` · ${inv.monthsToMaturity} mo left · ${formatCurrency(inv.maturityValue)} at maturity`:''}</div>
                        ) : inv.platform ? (
                          <div className="text-xs text-faint">{inv.platform}</div>
                        ) : null}
                        {inv.notes && <div className="text-xs text-faint truncate max-w-[160px]">{inv.notes}</div>}
                      </td>
                      <td className="px-4 py-3"><Badge variant="info">{inv.type.replace('_',' ')}</Badge></td>
                      <td className="px-4 py-3 text-sm font-medium">{formatCurrency(inv.invested_amount)}</td>
                      <td className="px-4 py-3 text-sm font-semibold">{formatCurrency(inv.current_value)}</td>
                      <td className="px-4 py-3">
                        <div className={`text-sm font-semibold flex items-center gap-1 ${classifyGL(inv.gainLoss)}`}>
                          {Number(inv.gainLoss)>=0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
                          {Number(inv.gainLoss)>=0?'+':''}{formatCurrency(inv.gainLoss)}
                          <span className="text-xs font-normal">({inv.gainLossPercentage?.toFixed(1)}%)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{inv.date}<div><UpdatedAt at={inv.updated_at} icon={false}/></div></td>
                      <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                        <div className="flex gap-1">
                          {inv.type==='SIP' && <Button size="sm" variant="outline" onClick={()=>setNavModal({open:true,inv})} title="Update NAV & units">NAV</Button>}
                          {(inv.type==='STOCKS' || inv.type==='SIP') && <Button size="sm" variant="outline" onClick={()=>setSellInv(inv)} title={inv.type==='STOCKS'?'Sell shares':'Redeem units'}><BadgeIndianRupee size={13}/> Sell</Button>}
                          <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:inv})}><Pencil size={14} className="text-muted"/></Button>
                          <Button size="icon" variant="ghost" onClick={()=>del(inv.id)}><Trash2 size={14} className="text-red-400"/></Button>
                        </div>
                      </td>
                    </tr>
                    {isStock && open && (
                      <tr className="bg-surface-2/60">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-3 text-sm">
                            <div><p className="text-faint text-xs">Avg buy price</p><p className="font-semibold">{formatCurrency(inv.avgBuyPrice)}</p></div>
                            <div><p className="text-faint text-xs">Current price</p><p className="font-semibold">{formatCurrency(inv.current_price)}</p></div>
                            <div><p className="text-faint text-xs">Units</p><p className="font-semibold">{inv.units}</p></div>
                            <div><p className="text-faint text-xs">P&amp;L</p><p className={`font-semibold ${classifyGL(inv.gainLoss)}`}>{Number(inv.gainLoss)>=0?'+':''}{formatCurrency(inv.gainLoss)} ({inv.gainLossPercentage?.toFixed(1)}%)</p></div>
                            <div><p className="text-faint text-xs">Last traded</p><p className="font-semibold">{inv.lastTradedDate||inv.date}</p></div>
                            <button onClick={()=>setLotModal({open:true,inv,mode:'price'})} className="text-xs text-brand-600 underline">Update current price</button>
                            <button onClick={()=>setLotModal({open:true,inv,mode:'lot'})} className="text-xs text-brand-600 underline flex items-center gap-1"><Plus size={12}/> Add purchase</button>
                          </div>
                          {lots.length===0 ? <p className="text-xs text-faint">No purchase lots recorded.</p> : (
                            <table className="w-full text-xs">
                              <thead><tr className="text-faint text-left"><th className="font-medium py-1">Date</th><th className="font-medium">Units</th><th className="font-medium">Buy Price</th><th className="font-medium">Cost</th><th></th></tr></thead>
                              <tbody>
                                {lots.map(l=>(
                                  <tr key={l.id} className="border-t border-line">
                                    <td className="py-1.5">{l.date}</td>
                                    <td>{l.units}</td>
                                    <td>{formatCurrency(l.price)}</td>
                                    <td>{formatCurrency(l.units*l.price)}</td>
                                    <td className="text-right"><button onClick={()=>delLot(l.id, inv.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                    {isSip && navExpanded && (
                      <tr className="bg-surface-2/60">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-content">Monthly NAV &amp; units</p>
                            <button onClick={()=>setNavModal({open:true,inv})} className="text-xs text-brand-600 underline flex items-center gap-1"><Plus size={12}/> Add / update this month</button>
                          </div>
                          {navHist.length===0 ? <p className="text-xs text-faint">No NAV entries yet — add one to start tracking monthly.</p> : (
                            <table className="w-full text-xs">
                              <thead><tr className="text-faint text-left"><th className="font-medium py-1">Month</th><th className="font-medium">NAV</th><th className="font-medium">Units</th><th className="font-medium">Value</th><th className="font-medium">P&amp;L vs invested</th></tr></thead>
                              <tbody>
                                {navHist.map(h=>{
                                  const val = Number(h.nav||0)*Number(h.units||0)
                                  return (
                                  <tr key={h.id} className="border-t border-line">
                                    <td className="py-1.5 font-medium text-content">{h.ym}</td>
                                    <td>{formatCurrency(h.nav)}</td>
                                    <td>{h.units}</td>
                                    <td className="font-medium">{formatCurrency(val)}</td>
                                    <td className={classifyGL(val - Number(inv.invested_amount||0))}>{val-Number(inv.invested_amount||0)>=0?'+':''}{formatCurrency(val - Number(inv.invested_amount||0))}</td>
                                  </tr>
                                )})}
                              </tbody>
                            </table>
                          )}
                          <p className="text-[11px] text-faint mt-2">P&amp;L compares each month's market value with your total invested so far ({formatCurrency(inv.invested_amount)}).</p>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SoldSection refreshKey={soldTick} onChanged={()=>fetchAll()}/>

      {sellInv && <SellModal inv={sellInv} onClose={()=>setSellInv(null)} onDone={()=>{ fetchAll(); setSoldTick(t=>t+1) }}/>}

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null})} title={modal.item?'Edit Investment':'Add Investment'} size="lg">
        <InvestmentForm initial={modal.item} onSave={async(d)=>{ if(modal.item) await update(modal.item.id,d); else await create(d) }} onClose={()=>setModal({open:false,item:null})}/>
      </Modal>
      <Modal open={lotModal.open} onClose={()=>setLotModal({open:false,inv:null,mode:'lot'})} title={lotModal.mode==='price'?'Update Current Price':`Add Purchase — ${lotModal.inv?.title||''}`} size="sm">
        {lotModal.inv && (lotModal.mode==='price'
          ? <StockPriceForm inv={lotModal.inv} onSave={setPrice} onClose={()=>setLotModal({open:false,inv:null,mode:'lot'})}/>
          : <StockLotForm inv={lotModal.inv} onSave={addLot} onClose={()=>setLotModal({open:false,inv:null,mode:'lot'})}/>)}
      </Modal>
      <Modal open={navModal.open} onClose={()=>setNavModal({open:false,inv:null})} title={`Update NAV & Units — ${navModal.inv?.title||''}`} size="sm">
        {navModal.inv && <NavForm inv={navModal.inv} onSave={saveNav} onClose={()=>setNavModal({open:false,inv:null})}/>}
      </Modal>
    </div>
  )
}
