const { ipcMain } = require('electron')
const { getDb, refreshSipValues } = require('../database')
const { postBankTxn, localToday } = require('../lib/ledger')
const cg = require('../lib/capitalGains')
const { recomputeStock, ensureBaseLot } = require('./investmentHandlers')

// Selling stocks and SIP / mutual-fund units.
//
//   sale:preview  -> works out the sale (FIFO lots, short/long-term split, charges, tax) WITHOUT
//                    changing anything, so the Sell popup can show the numbers live.
//   sale:execute  -> does it: reduces the holding, records the sale in the separate "Sold" list,
//                    and credits the net proceeds to the chosen bank account (statement entry).
//   sale:undo     -> puts everything back exactly (latest sale of a holding only).

const ymOf = (d) => String(d || '').slice(0, 7)
function monthsInclusive(startYM, endYM) {
  const [sy, sm] = String(startYM).split('-').map(Number)
  const [ey, em] = String(endYM).split('-').map(Number)
  if (!sy || !sm || !ey || !em) return 0
  const n = (ey - sy) * 12 + (em - sm) + 1
  return n > 0 ? n : 0
}

function salesInFy(db, fy, excludeId = null) {
  const { start, end } = cg.fyRange(fy)
  return db.prepare('SELECT id, category, st_gain, lt_gain, slab_rate FROM investment_sales WHERE sell_date BETWEEN ? AND ? AND id IS NOT ?')
    .all(start, end, excludeId)
}

// Work out a sale. Throws an Error with a friendly message when the input can't be sold.
function planSale(db, p) {
  const inv = db.prepare('SELECT * FROM investments WHERE id=?').get(p.investment_id)
  if (!inv) throw new Error('Investment not found')
  if (inv.status === 'CLOSED') throw new Error('This holding is already fully sold')
  const kind = inv.type
  if (kind !== 'STOCKS' && kind !== 'SIP') throw new Error('Selling is available for Stocks and SIP / mutual funds')

  const sellDate = String(p.date || localToday()).slice(0, 10)
  const units = Number(p.units) || 0
  const price = Number(p.price) || 0
  if (!(units > 0)) throw new Error('Enter how many units you are selling')
  if (!(price > 0)) throw new Error(kind === 'STOCKS' ? 'Enter the sell price per share' : 'Enter the NAV you redeemed at')
  const category = kind === 'STOCKS' ? 'EQUITY' : (p.category === 'DEBT' ? 'DEBT' : 'EQUITY')
  const slabRate = category === 'DEBT' ? (p.slab_rate === '' || p.slab_rate == null ? 30 : Number(p.slab_rate) || 0) : null

  let held, chunks, lotUpdates = null, avgCost
  if (kind === 'STOCKS') {
    let lots = db.prepare('SELECT id, units, price, date FROM stock_purchases WHERE investment_id=?').all(inv.id)
    // Legacy holding with no lots: treat the whole position as one lot bought on its date.
    if (lots.length === 0 && inv.units > 0) {
      lots = [{ id: null, units: inv.units, price: inv.invested_amount && inv.units ? inv.invested_amount / inv.units : (inv.purchase_price || 0), date: inv.date }]
    }
    held = lots.reduce((s, l) => s + (Number(l.units) || 0), 0)
    if (units > held + 1e-9) throw new Error(`You only hold ${+held.toFixed(4)} shares`)
    const r = cg.consumeStockLots(lots, units)
    chunks = r.chunks; lotUpdates = r.updates
    avgCost = held > 0 ? lots.reduce((s, l) => s + l.units * l.price, 0) / held : 0
  } else {
    held = Number(inv.units) || 0
    if (!(held > 0) && Number(p.held_units) > 0) held = Number(p.held_units)
    if (!(held > 0)) throw new Error('Enter the total units you hold in this fund (see your fund statement)')
    if (units > held + 1e-9) throw new Error(`You only hold ${+held.toFixed(4)} units`)
    const costHeld = Number(inv.invested_amount) || 0
    avgCost = costHeld / held
    const lump = String(inv.sip_mode || 'MONTHLY').toUpperCase() === 'LUMPSUM'
    let instalments
    if (lump) {
      instalments = [{ date: inv.date, amount: costHeld + (Number(inv.sold_cost) || 0) }]
    } else {
      // Instalments paid up to the sell month (or the plan's end month, if earlier).
      let endYM = ymOf(sellDate)
      if (inv.sip_end && ymOf(inv.sip_end) < endYM) endYM = ymOf(inv.sip_end)
      const months = monthsInclusive(ymOf(inv.date), endYM)
      instalments = cg.sipInstalments(inv.date, months, inv.sip_amount, inv.auto_day)
    }
    chunks = cg.consumeFundInstalments(instalments, inv.sold_cost, avgCost * units, avgCost)
  }

  const gross = units * price
  const stt = p.stt === '' || p.stt == null ? cg.defaultStt(kind, category, gross) : Number(p.stt) || 0
  const g = cg.saleGains({ chunks, price, brokerage: Number(p.brokerage) || 0, stt, sellDate })
  const fy = cg.fyOf(sellDate)
  const tax = cg.marginalTax(salesInFy(db, fy), { category, st_gain: g.stGain, lt_gain: g.ltGain, slab_rate: slabRate })

  return {
    inv, kind, category, slabRate, sellDate, units, price, held,
    remainingUnits: Math.max(0, held - units), avgCost: cg.round2(avgCost),
    g, fy, tax, lotUpdates, isEstimate: kind === 'SIP',
  }
}

// What the renderer needs from a plan (no DB rows it shouldn't edit).
const publicPlan = (pl) => ({
  ok: true, kind: pl.kind, category: pl.category, slabRate: pl.slabRate, sellDate: pl.sellDate,
  units: pl.units, price: pl.price, held: pl.held, remainingUnits: pl.remainingUnits, avgCost: pl.avgCost,
  fullySold: pl.remainingUnits <= 1e-9, isEstimate: pl.isEstimate, fy: pl.fy,
  ...pl.g, taxAdded: pl.tax.added, fyBefore: pl.tax.before, fyAfter: pl.tax.after, rules: cg.RULES,
})

module.exports = function registerSaleHandlers() {
  const db = getDb()

  ipcMain.handle('sale:preview', (_, p) => {
    try {
      if (p && p.investment_id) {
        const inv = db.prepare('SELECT type FROM investments WHERE id=?').get(p.investment_id)
        if (inv && inv.type === 'SIP') refreshSipValues()
      }
      return publicPlan(planSale(db, p || {}))
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('sale:execute', (_, p) => {
    try {
      const run = db.transaction(() => {
        const pre = db.prepare('SELECT type FROM investments WHERE id=?').get(p.investment_id)
        if (pre && pre.type === 'STOCKS') ensureBaseLot(db, p.investment_id) // legacy -> real lot first
        if (pre && pre.type === 'SIP') refreshSipValues()
        const pl = planSale(db, p)
        const inv = pl.inv
        const snapshot = {
          investment: inv,
          lots: pl.kind === 'STOCKS' ? db.prepare('SELECT * FROM stock_purchases WHERE investment_id=?').all(inv.id) : null,
        }
        const soldCost = (Number(inv.sold_cost) || 0) + pl.g.costBasis
        const soldUnits = (Number(inv.sold_units) || 0) + pl.units
        const fully = pl.remainingUnits <= 1e-9

        if (pl.kind === 'STOCKS') {
          for (const u of pl.lotUpdates) {
            if (u.units_left <= 1e-9) db.prepare('DELETE FROM stock_purchases WHERE id=?').run(u.id)
            else db.prepare('UPDATE stock_purchases SET units=? WHERE id=?').run(u.units_left, u.id)
          }
          if (fully) {
            db.prepare(`UPDATE investments SET units=0, invested_amount=0, current_value=0, status='CLOSED',
              sold_cost=?, sold_units=?, updated_at=datetime('now') WHERE id=?`).run(soldCost, soldUnits, inv.id)
          } else {
            // The sell price is the latest market price you saw — value what's left at it.
            db.prepare(`UPDATE investments SET current_price=?, sold_cost=?, sold_units=?, updated_at=datetime('now') WHERE id=?`)
              .run(pl.price, soldCost, soldUnits, inv.id)
            recomputeStock(db, inv.id)
          }
        } else if (fully) {
          db.prepare(`UPDATE investments SET units=0, invested_amount=0, current_value=0, status='CLOSED',
            sold_cost=?, sold_units=?, fund_category=?, updated_at=datetime('now') WHERE id=?`)
            .run(soldCost, soldUnits, pl.category, inv.id)
        } else {
          const left = pl.remainingUnits
          db.prepare(`UPDATE investments SET units=?, current_price=?, current_value=?, invested_amount=?,
            sold_cost=?, sold_units=?, fund_category=?, last_traded_date=?, updated_at=datetime('now') WHERE id=?`)
            .run(left, pl.price, left * pl.price, Math.max(0, (Number(inv.invested_amount) || 0) - pl.g.costBasis),
              soldCost, soldUnits, pl.category, pl.sellDate, inv.id)
        }

        const r = db.prepare(`
          INSERT INTO investment_sales (investment_id, title, type, category, slab_rate, units, sell_price, sell_date,
            first_buy_date, last_buy_date, avg_holding_days, gross, brokerage, stt, net_proceeds, cost_basis, gain,
            st_gain, lt_gain, est_tax, account_id, chunks_json, snapshot_json, notes)
          VALUES (@investment_id, @title, @type, @category, @slab_rate, @units, @sell_price, @sell_date,
            @first_buy_date, @last_buy_date, @avg_holding_days, @gross, @brokerage, @stt, @net_proceeds, @cost_basis, @gain,
            @st_gain, @lt_gain, @est_tax, @account_id, @chunks_json, @snapshot_json, @notes)
        `).run({
          investment_id: inv.id, title: inv.title, type: inv.type, category: pl.category, slab_rate: pl.slabRate,
          units: pl.units, sell_price: pl.price, sell_date: pl.sellDate,
          first_buy_date: pl.g.firstBuy, last_buy_date: pl.g.lastBuy, avg_holding_days: pl.g.avgHoldingDays,
          gross: pl.g.gross, brokerage: pl.g.brokerage, stt: pl.g.stt, net_proceeds: pl.g.netProceeds,
          cost_basis: pl.g.costBasis, gain: pl.g.gain, st_gain: pl.g.stGain, lt_gain: pl.g.ltGain,
          est_tax: pl.tax.added, account_id: p.account_id ? Number(p.account_id) : null,
          chunks_json: JSON.stringify(pl.g.rows), snapshot_json: JSON.stringify(snapshot), notes: p.notes || null,
        })
        const saleId = Number(r.lastInsertRowid)
        if (p.account_id) {
          const txId = postBankTxn(db, Number(p.account_id), pl.g.netProceeds, {
            source: 'INVESTMENT_SALE', refType: 'sale', refId: saleId, date: pl.sellDate,
            note: `Sold ${+pl.units.toFixed(4)} ${pl.kind === 'STOCKS' ? 'sh' : 'units'} of ${inv.title} @ ₹${pl.price}`,
          })
          db.prepare('UPDATE investment_sales SET bank_txn_id=? WHERE id=?').run(txId, saleId)
        }
        return saleId
      })
      const id = run()
      return { ok: true, sale: db.prepare('SELECT * FROM investment_sales WHERE id=?').get(id) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('sale:getAll', () =>
    db.prepare(`SELECT s.id, s.investment_id, s.title, s.type, s.category, s.slab_rate, s.units, s.sell_price, s.sell_date,
        s.first_buy_date, s.last_buy_date, s.avg_holding_days, s.gross, s.brokerage, s.stt, s.net_proceeds, s.cost_basis,
        s.gain, s.st_gain, s.lt_gain, s.est_tax, s.account_id, s.chunks_json, s.notes, s.created_at, s.updated_at,
        b.name AS account_name,
        (SELECT MAX(id) FROM investment_sales x WHERE x.investment_id = s.investment_id) = s.id AS can_undo
      FROM investment_sales s LEFT JOIN bank_accounts b ON b.id = s.account_id
      ORDER BY s.sell_date DESC, s.id DESC`).all())

  // Year-by-year realised gains and estimated tax (with set-off and the LTCG exemption).
  ipcMain.handle('sale:fySummary', () => {
    const rows = db.prepare('SELECT sell_date, category, st_gain, lt_gain, slab_rate, gross, net_proceeds, gain, brokerage, stt FROM investment_sales').all()
    const by = {}
    for (const r of rows) {
      const fy = cg.fyOf(r.sell_date)
      const b = (by[fy] = by[fy] || { fy, count: 0, gross: 0, net: 0, gain: 0, charges: 0, sales: [] })
      b.count++; b.gross += r.gross || 0; b.net += r.net_proceeds || 0; b.gain += r.gain || 0
      b.charges += (r.brokerage || 0) + (r.stt || 0); b.sales.push(r)
    }
    return Object.values(by).sort((a, b) => b.fy.localeCompare(a.fy)).map((b) => ({
      fy: b.fy, count: b.count, gross: cg.round2(b.gross), net: cg.round2(b.net), gain: cg.round2(b.gain),
      charges: cg.round2(b.charges), tax: cg.fyTax(b.sales),
    }))
  })

  ipcMain.handle('sale:undo', (_, id) => {
    try {
      const run = db.transaction(() => {
        const s = db.prepare('SELECT * FROM investment_sales WHERE id=?').get(id)
        if (!s) throw new Error('Sale not found')
        const latest = db.prepare('SELECT MAX(id) m FROM investment_sales WHERE investment_id=?').get(s.investment_id).m
        if (latest !== s.id) throw new Error('Undo the most recent sale of this holding first')
        const snap = JSON.parse(s.snapshot_json || '{}')
        const inv = snap.investment
        const exists = inv && db.prepare('SELECT 1 FROM investments WHERE id=?').get(inv.id)
        if (exists) {
          db.prepare(`UPDATE investments SET units=@units, invested_amount=@invested_amount, current_value=@current_value,
            current_price=@current_price, purchase_price=@purchase_price, last_traded_date=@last_traded_date, status=@status,
            sold_cost=@sold_cost, sold_units=@sold_units, fund_category=@fund_category, updated_at=datetime('now') WHERE id=@id`)
            .run({
              units: inv.units, invested_amount: inv.invested_amount, current_value: inv.current_value,
              current_price: inv.current_price, purchase_price: inv.purchase_price, last_traded_date: inv.last_traded_date,
              status: inv.status || 'ACTIVE', sold_cost: inv.sold_cost || 0, sold_units: inv.sold_units || 0,
              fund_category: inv.fund_category || 'EQUITY', id: inv.id,
            })
          if (Array.isArray(snap.lots)) {
            db.prepare('DELETE FROM stock_purchases WHERE investment_id=?').run(inv.id)
            const ins = db.prepare('INSERT INTO stock_purchases (id, investment_id, units, price, date, created_at) VALUES (?,?,?,?,?,?)')
            for (const l of snap.lots) ins.run(l.id, l.investment_id, l.units, l.price, l.date, l.created_at)
          }
        }
        if (s.account_id && s.bank_txn_id) {
          postBankTxn(db, s.account_id, -(Number(s.net_proceeds) || 0), {
            source: 'INVESTMENT_SALE', refType: 'sale', refId: s.id, note: `Sale undone: ${s.title}`,
          })
        }
        db.prepare('DELETE FROM investment_sales WHERE id=?').run(s.id)
      })
      run()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

module.exports.planSale = planSale
