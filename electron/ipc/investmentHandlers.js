const { ipcMain } = require('electron')
const { getDb, refreshSipValues } = require('../database')

// Number of monthly installments between two 'YYYY-MM[-DD]' values, inclusive.
// Whole months between two full dates (YYYY-MM-DD) — used for bond tenure.
function monthsBetweenDates(a, b) {
  if (!a || !b) return 0
  const d1 = new Date(a), d2 = new Date(b)
  if (isNaN(d1) || isNaN(d2)) return 0
  const m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())
  return m > 0 ? m : 0
}

// A bond rate may be quoted per month (short-term) or per year. Everything downstream works
// from the monthly rate, so convert once here.
function bondMaths(row) {
  const P = row.invested_amount || 0
  const pct = row.interest_rate || 0
  const monthlyRate = String(row.rate_period || 'YEARLY').toUpperCase() === 'MONTHLY' ? pct / 100 : pct / 100 / 12
  const months = monthsBetweenDates(row.date, row.maturity_date)
  const perMonth = P * monthlyRate
  const totalInterest = perMonth * months          // simple: coupons paid out, not reinvested
  return {
    ratePerMonthPct: parseFloat((monthlyRate * 100).toFixed(4)),
    ratePerYearPct: parseFloat((monthlyRate * 12 * 100).toFixed(2)),
    monthsToMaturity: months,
    interestPerMonth: parseFloat(perMonth.toFixed(2)),
    expectedInterest: parseFloat(totalInterest.toFixed(2)),
    maturityValue: parseFloat((P + totalInterest).toFixed(2)),
  }
}

function monthsBetween(startYM, endYM) {
  if (!startYM || !endYM) return 0
  const [sy, sm] = String(startYM).split('-').map(Number)
  const [ey, em] = String(endYM).split('-').map(Number)
  if (!sy || !sm || !ey || !em) return 0
  const n = (ey - sy) * 12 + (em - sm) + 1
  return n > 0 ? n : 0
}

// End month capped at the current month — SIP "invested so far" is current-time based;
// the end month is only a target reminder, it never inflates the invested amount.
function cappedEndYM(endYM) {
  const now = new Date()
  const nowYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (!endYM) return nowYM
  const e = String(endYM).slice(0, 7)
  return e <= nowYM ? e : nowYM
}

// Future value of a SIP: P invested monthly for `months` at `annualRatePct` (compounded monthly).
function sipFutureValue(P, annualRatePct, months) {
  if (months <= 0 || !P) return 0
  const i = (annualRatePct || 0) / 100 / 12
  if (i === 0) return P * months
  return P * ((Math.pow(1 + i, months) - 1) / i) * (1 + i)
}

// Annualised return (XIRR) for a SIP: monthly outflows of P, one inflow (current value) today.
function sipXirr(P, months, startYM, currentValue) {
  if (!P || months <= 0 || !startYM || !(currentValue > 0)) return null
  const [sy, sm] = String(startYM).split('-').map(Number)
  if (!sy || !sm) return null
  const start = new Date(sy, sm - 1, 1)
  const today = new Date()
  const YEAR = 365.25 * 24 * 3600 * 1000
  const flows = []
  for (let k = 0; k < months; k++) {
    const d = new Date(sy, sm - 1 + k, 1)
    flows.push({ t: (d - start) / YEAR, amt: -P })
  }
  flows.push({ t: Math.max((today - start) / YEAR, 1 / 365), amt: currentValue })
  let r = 0.1
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0, dnpv = 0
    for (const f of flows) {
      const base = Math.pow(1 + r, f.t)
      npv += f.amt / base
      dnpv += (-f.t * f.amt) / (base * (1 + r))
    }
    if (Math.abs(dnpv) < 1e-9) break
    let rNew = r - npv / dnpv
    if (!isFinite(rNew)) return null
    if (rNew <= -0.9999) rNew = -0.9999
    if (Math.abs(rNew - r) < 1e-6) { r = rNew; break }
    r = rNew
  }
  if (!isFinite(r) || r <= -1) return null
  return parseFloat((r * 100).toFixed(2))
}

function enrichInvestment(row) {
  const cv = row.current_value || row.invested_amount
  const gainLoss = cv - row.invested_amount
  const gainLossPct = row.invested_amount > 0 ? ((gainLoss / row.invested_amount) * 100).toFixed(2) : 0
  const out = { ...row, gainLoss, gainLossPercentage: parseFloat(gainLossPct) }
  if (row.type === 'SIP' && String(row.sip_mode || 'MONTHLY').toUpperCase() === 'LUMPSUM') {
    // One-time investment: no installments. Projection is simple compounding to the target
    // date, and the return is a CAGR rather than a SIP XIRR.
    const P = row.invested_amount || 0
    const years = row.sip_end ? monthsBetween(row.date, row.sip_end) / 12 : 0
    const fv = years > 0 ? P * Math.pow(1 + (row.interest_rate || 0) / 100, years) : 0
    out.months = 1
    out.plannedMonths = 0
    out.isLumpsum = true
    out.projectedValue = parseFloat(fv.toFixed(2))
    out.projectedGain = parseFloat((fv - P).toFixed(2))
    const heldYears = monthsBetween(row.date, null) / 12
    out.annualizedReturn = (P > 0 && heldYears >= 0.5 && cv > 0)
      ? parseFloat(((Math.pow(cv / P, 1 / heldYears) - 1) * 100).toFixed(2))
      : null
  } else if (row.type === 'SIP') {
    const months = monthsBetween(row.date, cappedEndYM(row.sip_end)) // installments paid so far (current-time based)
    const plannedMonths = monthsBetween(row.date, row.sip_end)        // full plan, only for the projection
    const projectedValue = sipFutureValue(row.sip_amount || 0, row.interest_rate || 0, plannedMonths)
    const plannedInvested = (row.sip_amount || 0) * plannedMonths
    out.months = months
    out.plannedMonths = plannedMonths
    out.projectedValue = parseFloat(projectedValue.toFixed(2))
    out.projectedGain = parseFloat((projectedValue - plannedInvested).toFixed(2))
    out.annualizedReturn = sipXirr(row.sip_amount || 0, months, row.date, cv)
  }
  // After a partial sell the SIP's cash flows are no longer "P every month", so the SIP XIRR
  // would be misleading — hide it rather than show a wrong number.
  if (Number(row.sold_cost) > 0) out.annualizedReturn = null
  if (row.type === 'BONDS') Object.assign(out, bondMaths(row))
  if (row.type === 'STOCKS') {
    out.avgBuyPrice = row.purchase_price || 0
    out.lastTradedDate = row.last_traded_date || row.date
  }
  return out
}

// Recompute a STOCKS holding from its buy lots: total units, weighted-average buy
// price, total invested, current value (current price x units) and last traded date.
function recomputeStock(db, id) {
  const lots = db.prepare('SELECT units, price, date FROM stock_purchases WHERE investment_id=?').all(id)
  if (lots.length === 0) return // legacy stock with no lots — leave its stored values untouched
  let units = 0, cost = 0, lastDate = ''
  for (const l of lots) { units += l.units; cost += l.units * l.price; if (String(l.date) > lastDate) lastDate = String(l.date) }
  const avg = units > 0 ? cost / units : 0
  const inv = db.prepare('SELECT current_price, date FROM investments WHERE id=?').get(id)
  const curPrice = (inv && inv.current_price) ? inv.current_price : avg
  db.prepare(`UPDATE investments SET units=?, invested_amount=?, purchase_price=?, current_value=?,
    last_traded_date=?, updated_at=datetime('now') WHERE id=?`)
    .run(units, parseFloat(cost.toFixed(2)), parseFloat(avg.toFixed(4)), parseFloat((curPrice * units).toFixed(2)),
      lastDate || (inv && inv.date) || null, id)
}

// Legacy stocks (created before lots existed) hold their position directly. Before adding
// a new lot, convert the existing position into a base lot so nothing is lost.
function ensureBaseLot(db, id) {
  const cnt = db.prepare('SELECT COUNT(*) c FROM stock_purchases WHERE investment_id=?').get(id).c
  if (cnt > 0) return
  const inv = db.prepare('SELECT units, purchase_price, invested_amount, current_value, current_price, date FROM investments WHERE id=?').get(id)
  if (!inv || !(inv.units > 0)) return
  const price = (inv.invested_amount && inv.units) ? inv.invested_amount / inv.units : (inv.purchase_price || 0)
  db.prepare('INSERT INTO stock_purchases (investment_id, units, price, date) VALUES (?,?,?,?)').run(id, inv.units, price, inv.date)
  if (!inv.current_price && inv.current_value && inv.units) {
    db.prepare('UPDATE investments SET current_price=? WHERE id=?').run(inv.current_value / inv.units, id)
  }
}

module.exports = function registerInvestmentHandlers() {
  const db = getDb()

  ipcMain.handle('investment:getAll', (_, { type } = {}) => {
    refreshSipValues() // recompute SIP invested/current against today before reading
    const rows = type
      ? db.prepare('SELECT * FROM investments WHERE type=? ORDER BY COALESCE(sort_order, 999999), date DESC').all(type)
      : db.prepare('SELECT * FROM investments ORDER BY COALESCE(sort_order, 999999), date DESC').all()
    return rows.map(enrichInvestment)
  })

  ipcMain.handle('investment:create', (_, data) => {
    const result = db.prepare(`
      INSERT INTO investments (title, type, invested_amount, current_value, units, purchase_price, current_price, interest_rate, sip_amount, sip_end, sip_gain_pct, sip_mode, maturity_date, rate_period, auto_amount, auto_day, platform, date, notes, status)
      VALUES (@title, @type, @invested_amount, @current_value, @units, @purchase_price, @current_price, @interest_rate, @sip_amount, @sip_end, @sip_gain_pct, @sip_mode, @maturity_date, @rate_period, @auto_amount, @auto_day, @platform, @date, @notes, @status)
    `).run({
      title: data.title, type: data.type,
      invested_amount: data.invested_amount,
      current_value: data.current_value || data.invested_amount,
      units: data.units || null, purchase_price: data.purchase_price || null,
      current_price: data.current_price || null, interest_rate: data.interest_rate || null,
      sip_amount: data.sip_amount || null, sip_end: data.sip_end || null,
      sip_gain_pct: data.sip_gain_pct ?? null,
      sip_mode: data.sip_mode === 'LUMPSUM' ? 'LUMPSUM' : 'MONTHLY',
      maturity_date: data.maturity_date || null,
      rate_period: data.rate_period === 'MONTHLY' ? 'MONTHLY' : 'YEARLY',
      auto_amount: data.auto_amount || null, auto_day: data.auto_day || null,
      platform: data.platform || null,
      date: data.date, notes: data.notes || null, status: data.status || 'ACTIVE',
    })
    const newId = result.lastInsertRowid
    // Stocks: record the first buy as a lot and compute the average.
    if (data.type === 'STOCKS' && (data.units || data.purchase_price)) {
      db.prepare('INSERT INTO stock_purchases (investment_id, units, price, date) VALUES (?,?,?,?)')
        .run(newId, Number(data.units) || 0, Number(data.purchase_price) || 0, data.date)
      recomputeStock(db, newId)
    }
    return enrichInvestment(db.prepare('SELECT * FROM investments WHERE id=?').get(newId))
  })

  ipcMain.handle('investment:getStockPurchases', (_, investmentId) =>
    db.prepare('SELECT * FROM stock_purchases WHERE investment_id=? ORDER BY date DESC, id DESC').all(investmentId))

  ipcMain.handle('investment:addStockPurchase', (_, { investment_id, units, price, date }) => {
    ensureBaseLot(db, investment_id) // preserve a legacy position as its first lot before adding more
    db.prepare('INSERT INTO stock_purchases (investment_id, units, price, date) VALUES (?,?,?,?)')
      .run(investment_id, Number(units) || 0, Number(price) || 0, date)
    recomputeStock(db, investment_id)
    return enrichInvestment(db.prepare('SELECT * FROM investments WHERE id=?').get(investment_id))
  })

  ipcMain.handle('investment:deleteStockPurchase', (_, { id, investment_id }) => {
    db.prepare('DELETE FROM stock_purchases WHERE id=?').run(id)
    recomputeStock(db, investment_id)
    return enrichInvestment(db.prepare('SELECT * FROM investments WHERE id=?').get(investment_id))
  })

  ipcMain.handle('investment:updateStockPrice', (_, { id, current_price }) => {
    const price = Number(current_price) || 0
    db.prepare(`UPDATE investments SET current_price=?, updated_at=datetime('now') WHERE id=?`).run(price, id)
    const hasLots = db.prepare('SELECT COUNT(*) c FROM stock_purchases WHERE investment_id=?').get(id).c > 0
    if (hasLots) {
      recomputeStock(db, id)
    } else {
      // legacy stock: refresh current value from the new price x stored units (units/invested untouched)
      const inv = db.prepare('SELECT units FROM investments WHERE id=?').get(id)
      db.prepare('UPDATE investments SET current_value=? WHERE id=?').run(parseFloat((price * (inv.units || 0)).toFixed(2)), id)
    }
    return enrichInvestment(db.prepare('SELECT * FROM investments WHERE id=?').get(id))
  })

  ipcMain.handle('investment:update', (_, { id, data }) => {
    const existing = db.prepare('SELECT * FROM investments WHERE id=?').get(id)
    if (!existing) throw new Error('Investment not found')
    // Merge with the existing row so fields the form does not send
    // (current_price, platform, status) are preserved instead of throwing.
    const merged = {
      title: data.title ?? existing.title,
      type: data.type ?? existing.type,
      invested_amount: data.invested_amount ?? existing.invested_amount,
      current_value: (data.current_value || data.invested_amount) ?? existing.current_value,
      units: data.units || null,
      purchase_price: data.purchase_price || null,
      current_price: data.current_price ?? existing.current_price ?? null,
      interest_rate: data.interest_rate ?? existing.interest_rate ?? null,
      sip_amount: data.sip_amount ?? existing.sip_amount ?? null,
      sip_end: data.sip_end ?? existing.sip_end ?? null,
      sip_gain_pct: data.sip_gain_pct ?? existing.sip_gain_pct ?? null,
      sip_mode: data.sip_mode ?? existing.sip_mode ?? 'MONTHLY',
      maturity_date: data.maturity_date ?? existing.maturity_date ?? null,
      rate_period: data.rate_period ?? existing.rate_period ?? 'YEARLY',
      auto_amount: data.auto_amount !== undefined ? (data.auto_amount || null) : (existing.auto_amount ?? null),
      auto_day: data.auto_day !== undefined ? (data.auto_day || null) : (existing.auto_day ?? null),
      platform: data.platform ?? existing.platform ?? null,
      date: data.date ?? existing.date,
      notes: data.notes || null,
      status: data.status ?? existing.status ?? 'ACTIVE',
      id,
    }
    db.prepare(`
      UPDATE investments SET title=@title, type=@type, invested_amount=@invested_amount, current_value=@current_value,
        units=@units, purchase_price=@purchase_price, current_price=@current_price, interest_rate=@interest_rate,
        sip_amount=@sip_amount, sip_end=@sip_end, sip_gain_pct=@sip_gain_pct, sip_mode=@sip_mode, maturity_date=@maturity_date,
        rate_period=@rate_period,
        auto_amount=@auto_amount, auto_day=@auto_day,
        platform=@platform, date=@date, notes=@notes, status=@status, updated_at=datetime('now')
      WHERE id=@id
    `).run(merged)
    return enrichInvestment(db.prepare('SELECT * FROM investments WHERE id=?').get(id))
  })

  ipcMain.handle('investment:delete', (_, id) => {
    db.prepare('DELETE FROM investments WHERE id=?').run(id)
    return { success: true }
  })

  // ---- SIP monthly NAV + units → real market value & P&L ----
  ipcMain.handle('investment:getNavHistory', (_, investmentId) =>
    db.prepare('SELECT * FROM sip_nav WHERE investment_id=? ORDER BY ym DESC').all(investmentId))

  // Record the NAV and total units held for a SIP for a given month (defaults to this month).
  // The latest figures become the SIP's current units/NAV, so value = units x NAV.
  ipcMain.handle('investment:saveNav', (_, { investment_id, ym, nav, units, date }) => {
    const now = new Date()
    const period = ym || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const navN = Number(nav) || 0, unitsN = Number(units) || 0
    db.prepare(`INSERT INTO sip_nav (investment_id, ym, nav, units, date) VALUES (?,?,?,?,?)
      ON CONFLICT(investment_id, ym) DO UPDATE SET nav=excluded.nav, units=excluded.units, date=excluded.date`)
      .run(investment_id, period, navN, unitsN, date || now.toISOString().split('T')[0])
    // Only the most recent month's entry drives the live value.
    const latest = db.prepare('SELECT nav, units FROM sip_nav WHERE investment_id=? ORDER BY ym DESC LIMIT 1').get(investment_id)
    if (latest) {
      db.prepare(`UPDATE investments SET units=?, current_price=?, current_value=?, last_traded_date=?, updated_at=datetime('now') WHERE id=?`)
        .run(latest.units, latest.nav, (Number(latest.units) || 0) * (Number(latest.nav) || 0), date || now.toISOString().split('T')[0], investment_id)
    }
    return enrichInvestment(db.prepare('SELECT * FROM investments WHERE id=?').get(investment_id))
  })
}

module.exports.recomputeStock = recomputeStock
module.exports.ensureBaseLot = ensureBaseLot
module.exports.enrichInvestment = enrichInvestment
