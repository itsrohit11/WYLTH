// Capital-gains maths for selling stocks and mutual-fund (SIP) units — India.
//
// Rules applied (FY 2025-26 onwards; Budget 2026 left them unchanged):
//   Listed equity shares & equity-oriented funds (>65% equity), STT paid
//     - Held 12 months or less  -> short-term (STCG)  taxed at 20%
//     - Held MORE than 12 months -> long-term (LTCG)  taxed at 12.5% on the part of the
//       financial year's total LTCG above Rs 1,25,000
//   Debt / other funds bought on or after 1 Apr 2023 -> always taxed at your income slab rate
//   Health & education cess of 4% is added on top of the tax. Surcharge is not modelled.
//   Brokerage and other transfer expenses reduce the gain; STT does NOT (but it does reduce
//   the cash you receive).
//   Set-off within the year: short-term losses can absorb short-term gains and long-term gains;
//   long-term losses can only absorb long-term gains.
//
// Everything here is a pure function (no database, no Electron) so it can be unit tested.

const RULES = {
  STCG_EQUITY_RATE: 0.20,
  LTCG_EQUITY_RATE: 0.125,
  LTCG_EXEMPTION: 125000,
  CESS: 0.04,
  EQUITY_LT_MONTHS: 12,
  // Default STT on the SELL side: delivery equity shares 0.1%, equity fund redemption 0.001%.
  STT_STOCK: 0.001,
  STT_EQUITY_FUND: 0.00001,
}

const pad2 = (n) => String(n).padStart(2, '0')
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

function parseDate(s) {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number)
  if (!y || !m) return null
  return { y, m, d: d || 1 }
}
const fmt = ({ y, m, d }) => `${y}-${pad2(m)}-${pad2(d)}`

// Add whole months to a YYYY-MM-DD date, clamping the day (31 Jan + 1 month -> 28/29 Feb).
function addMonths(dateStr, n) {
  const p = parseDate(dateStr)
  if (!p) return null
  const total = p.y * 12 + (p.m - 1) + n
  const y = Math.floor(total / 12), m = (total % 12) + 1
  const last = new Date(y, m, 0).getDate()
  return fmt({ y, m, d: Math.min(p.d, last) })
}

// Long-term only when held for MORE than `months` months.
function isLongTerm(buyDate, sellDate, months = RULES.EQUITY_LT_MONTHS) {
  const boundary = addMonths(buyDate, months)
  return !!boundary && String(sellDate).slice(0, 10) > boundary
}

function daysBetween(a, b) {
  const pa = parseDate(a), pb = parseDate(b)
  if (!pa || !pb) return 0
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000)
}

// Indian financial year (April -> March) a date falls in, e.g. '2026-27'.
function fyOf(dateStr) {
  const p = parseDate(dateStr)
  if (!p) return null
  const start = p.m >= 4 ? p.y : p.y - 1
  return `${start}-${pad2((start + 1) % 100)}`
}
function fyRange(fy) {
  const start = Number(String(fy).slice(0, 4))
  return { start: `${start}-04-01`, end: `${start + 1}-03-31` }
}

// ---- building the "chunks" being sold ------------------------------------------------------
// A chunk = some units bought on one date for a known cost. Sales consume chunks FIFO
// (oldest first), which is how Indian brokers / depositories match lots.

// Stocks: real purchase lots [{ id, units, price, date }].
function consumeStockLots(lots, unitsToSell) {
  const sorted = lots.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id)
  let need = Number(unitsToSell) || 0
  const chunks = [], updates = []
  for (const l of sorted) {
    if (need <= 1e-9) break
    const take = Math.min(Number(l.units) || 0, need)
    if (take <= 0) continue
    chunks.push({ lot_id: l.id, date: l.date, units: take, cost: take * (Number(l.price) || 0) })
    updates.push({ id: l.id, units_left: (Number(l.units) || 0) - take })
    need -= take
  }
  return { chunks, updates, shortfall: need > 1e-9 ? need : 0 }
}

// Monthly SIP: one instalment of `amount` per month from `startDate` for `months` months.
function sipInstalments(startDate, months, amount, day) {
  const out = []
  const p = parseDate(startDate)
  if (!p || !(months > 0)) return out
  const dd = Math.min(Math.max(Number(day) || p.d || 1, 1), 28)
  for (let k = 0; k < months; k++) {
    const dt = addMonths(fmt({ y: p.y, m: p.m, d: dd }), k)
    out.push({ date: dt, amount: Number(amount) || 0 })
  }
  return out
}

// Fund units: we know the total cost and total units, not each instalment's NAV, so each
// instalment is valued at the AVERAGE cost per unit. Units sold are matched FIFO by cost:
// skip the cost already sold earlier, then take `costToSell` from the oldest instalments.
function consumeFundInstalments(instalments, alreadySoldCost, costToSell, avgCostPerUnit) {
  let skip = Number(alreadySoldCost) || 0
  let need = Number(costToSell) || 0
  const chunks = []
  for (const ins of instalments) {
    let avail = ins.amount
    if (skip > 0) { const s = Math.min(skip, avail); avail -= s; skip -= s }
    if (avail <= 1e-9 || need <= 1e-9) continue
    const take = Math.min(avail, need)
    chunks.push({ date: ins.date, cost: take, units: avgCostPerUnit > 0 ? take / avgCostPerUnit : 0 })
    need -= take
  }
  // Rounding / data gaps: put any remainder on the latest instalment date.
  if (need > 0.01) {
    const last = instalments[instalments.length - 1]
    chunks.push({ date: last ? last.date : null, cost: need, units: avgCostPerUnit > 0 ? need / avgCostPerUnit : 0 })
  }
  return chunks
}

// ---- gains for one sale ---------------------------------------------------------------------
// price = sale price per unit. Brokerage is spread over chunks by units; STT is not deductible.
function saleGains({ chunks, price, brokerage = 0, stt = 0, sellDate, ltMonths = RULES.EQUITY_LT_MONTHS }) {
  const units = chunks.reduce((s, c) => s + c.units, 0)
  const gross = units * (Number(price) || 0)
  const brk = Number(brokerage) || 0, sttN = Number(stt) || 0
  let stGain = 0, ltGain = 0, stCost = 0, ltCost = 0, cost = 0, weightedDays = 0
  const rows = chunks.map((c) => {
    const proceeds = c.units * (Number(price) || 0)
    const charge = units > 0 ? brk * (c.units / units) : 0
    const gain = proceeds - charge - c.cost
    const lt = c.date ? isLongTerm(c.date, sellDate, ltMonths) : false
    const days = c.date ? daysBetween(c.date, sellDate) : 0
    if (lt) { ltGain += gain; ltCost += c.cost } else { stGain += gain; stCost += c.cost }
    cost += c.cost
    weightedDays += days * c.units
    return { ...c, proceeds: round2(proceeds), charge: round2(charge), gain: round2(gain), term: lt ? 'LONG' : 'SHORT', days }
  })
  const dates = chunks.map((c) => c.date).filter(Boolean).sort()
  return {
    units, gross: round2(gross), brokerage: round2(brk), stt: round2(sttN),
    netProceeds: round2(gross - brk - sttN),
    costBasis: round2(cost), gain: round2(gross - brk - cost),
    stGain: round2(stGain), ltGain: round2(ltGain), stCost: round2(stCost), ltCost: round2(ltCost),
    firstBuy: dates[0] || null, lastBuy: dates[dates.length - 1] || null,
    avgHoldingDays: units > 0 ? Math.round(weightedDays / units) : 0,
    rows,
  }
}

// ---- tax for a whole financial year ---------------------------------------------------------
// sales: [{ category:'EQUITY'|'DEBT', st_gain, lt_gain, slab_rate }]
function fyTax(sales) {
  let stEq = 0, ltEq = 0
  const slab = {}  // rate% -> net gain
  for (const s of sales || []) {
    if (s.category === 'DEBT') {
      const r = Number(s.slab_rate) || 0
      slab[r] = (slab[r] || 0) + (Number(s.st_gain) || 0) + (Number(s.lt_gain) || 0)
    } else {
      stEq += Number(s.st_gain) || 0
      ltEq += Number(s.lt_gain) || 0
    }
  }
  // Positive short-term-type buckets, highest rate first (losses absorb the costliest gains).
  const buckets = []
  let stLoss = 0
  if (stEq >= 0) buckets.push({ label: 'STCG (equity) @ 20%', rate: RULES.STCG_EQUITY_RATE, amount: stEq })
  else stLoss += -stEq
  for (const r of Object.keys(slab)) {
    const g = slab[r]
    if (g >= 0) buckets.push({ label: `Debt fund gains @ slab ${r}%`, rate: Number(r) / 100, amount: g })
    else stLoss += -g
  }
  buckets.sort((a, b) => b.rate - a.rate)
  let ltPos = Math.max(ltEq, 0)
  let ltLoss = Math.max(-ltEq, 0)
  const stLossTotal = stLoss, ltLossTotal = ltLoss

  for (const b of buckets) { const use = Math.min(b.amount, stLoss); b.amount -= use; stLoss -= use }
  { const use = Math.min(ltPos, stLoss); ltPos -= use; stLoss -= use }   // ST loss -> LT gain
  { const use = Math.min(ltPos, ltLoss); ltPos -= use; ltLoss -= use }   // LT loss -> LT gain only

  const exemption = Math.min(ltPos, RULES.LTCG_EXEMPTION)
  const taxableLT = ltPos - exemption
  let tax = taxableLT * RULES.LTCG_EQUITY_RATE
  for (const b of buckets) tax += b.amount * b.rate
  const cess = tax * RULES.CESS
  return {
    stcgEquity: round2(stEq), ltcgEquity: round2(ltEq),
    debtGains: round2(Object.values(slab).reduce((s, v) => s + v, 0)),
    stLosses: round2(stLossTotal), ltLosses: round2(ltLossTotal),
    exemptionUsed: round2(exemption), exemptionLeft: round2(RULES.LTCG_EXEMPTION - exemption),
    taxableLT: round2(taxableLT),
    taxableST: buckets.map((b) => ({ label: b.label, rate: b.rate, amount: round2(b.amount) })),
    carryForwardST: round2(stLoss), carryForwardLT: round2(ltLoss),
    tax: round2(tax), cess: round2(cess), total: round2(tax + cess),
  }
}

// Extra tax this one sale adds on top of the year's earlier sales.
function marginalTax(previousSales, thisSale) {
  const before = fyTax(previousSales)
  const after = fyTax([...(previousSales || []), thisSale])
  return { before, after, added: round2(after.total - before.total) }
}

function defaultStt(kind, category, gross) {
  if (category === 'DEBT') return 0
  const rate = kind === 'STOCKS' ? RULES.STT_STOCK : RULES.STT_EQUITY_FUND
  return round2((Number(gross) || 0) * rate)
}

module.exports = {
  RULES, addMonths, isLongTerm, daysBetween, fyOf, fyRange,
  consumeStockLots, sipInstalments, consumeFundInstalments, saleGains, fyTax, marginalTax, defaultStt, round2,
}
