const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn } = require('../lib/ledger')

// Outstanding balance for a card = card spends − payments + any expenses paid on this card.
// Card-paid expenses live in the expenses table (so they count in your monthly spending),
// and also add to what you owe on the card here.
function outstandingOf(db, cardId) {
  const tx = db.prepare(
    "SELECT COALESCE(SUM(CASE WHEN type='PAYMENT' THEN -amount ELSE amount END),0) o FROM card_transactions WHERE card_id=?"
  ).get(cardId).o || 0
  const exp = db.prepare('SELECT COALESCE(SUM(amount),0) o FROM expenses WHERE card_id=? AND deleted_at IS NULL').get(cardId).o || 0
  return tx + exp
}

// Latest of: the card being edited, a spend/payment being logged, or an expense charged to it.
function lastActivityOf(db, c) {
  const t = db.prepare('SELECT MAX(created_at) m FROM card_transactions WHERE card_id=?').get(c.id).m
  const e = db.prepare('SELECT MAX(COALESCE(updated_at, created_at)) m FROM expenses WHERE card_id=?').get(c.id).m
  return [c.updated_at, t, e].filter(Boolean).sort().pop() || null
}

// ---------- Everything that happened on a card, as one list ----------
// Spends logged on the card page, bill payments, AND expenses you charged to the card from the
// Expenses tab. (`source` says which, because only the first two can be edited here.)
function ledgerOf(db, cardId) {
  const tx = db.prepare(`SELECT t.id, t.title, t.amount, t.category, t.type, t.date, t.notes, t.bank_account_id, b.name AS account_name
    FROM card_transactions t LEFT JOIN bank_accounts b ON b.id=t.bank_account_id WHERE t.card_id=?`).all(cardId)
    .map((r) => ({ ...r, source: 'txn', type: r.type === 'PAYMENT' ? 'PAYMENT' : 'SPEND' }))
  const ex = db.prepare(`SELECT id, title, amount, category_name AS category, date, notes FROM expenses
    WHERE card_id=? AND deleted_at IS NULL`).all(cardId)
    .map((r) => ({ ...r, source: 'expense', type: 'SPEND', bank_account_id: null, account_name: null }))
  return [...tx, ...ex].sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.id - x.id))
}

// ---------- Statement cycle maths (all dates are local YYYY-MM-DD strings) ----------
const pad2 = (n) => String(n).padStart(2, '0')
const dim = (y, m) => new Date(y, m, 0).getDate()                       // days in month (m = 1..12)
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(Math.min(d, dim(y, m)))}`
const shiftMonth = (y, m, k) => { const t = y * 12 + (m - 1) + k; return [Math.floor(t / 12), (t % 12) + 1] }
const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000)
const localToday = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()) }

// Where the card stands against its statement: what is billed and due, what is still unbilled,
// and when the money must be paid.
//   outstanding = statementDue + unbilled   (always)
function statementOf(db, card, today = localToday()) {
  const rows = ledgerOf(db, card.id)
  const outstanding = rows.reduce((s, r) => s + (r.type === 'PAYMENT' ? -r.amount : r.amount), 0)
  const bd = Number(card.billing_day) || 0, dd = Number(card.due_day) || 0
  if (!bd) {
    // No statement day set: can't split into cycles; only a due day (if any) is used.
    let dueDate = null, daysToDue = null, status = outstanding > 0.5 ? 'NO_CYCLE' : 'PAID'
    if (dd) {
      const [ty, tm] = today.split('-').map(Number)
      dueDate = ymd(ty, tm, dd) >= today ? ymd(ty, tm, dd) : ymd(...shiftMonth(ty, tm, 1), dd)
      daysToDue = dayDiff(dueDate, today)
      if (outstanding > 0.5) status = daysToDue <= 5 ? 'DUE_SOON' : 'UPCOMING'
    }
    return { hasCycle: false, statementDue: Math.max(0, outstanding), unbilled: 0, dueDate, daysToDue, status, statementDate: null, cycleStart: null, nextStatement: null }
  }
  const [ty, tm] = today.split('-').map(Number)
  let [sy, sm] = [ty, tm]
  if (ymd(sy, sm, bd) > today) [sy, sm] = shiftMonth(sy, sm, -1)
  const S = ymd(sy, sm, bd)
  const [py, pm] = shiftMonth(sy, sm, -1)
  const P = ymd(py, pm, bd)
  const [ny, nm] = shiftMonth(sy, sm, 1)
  const N = ymd(ny, nm, bd)
  let balanceAtS = 0, paidAfterS = 0, spendsInStatement = 0
  for (const r of rows) {
    const signed = r.type === 'PAYMENT' ? -r.amount : r.amount
    if (r.date <= S) balanceAtS += signed
    else if (r.type === 'PAYMENT') paidAfterS += r.amount
    if (r.type === 'SPEND' && r.date > P && r.date <= S) spendsInStatement += r.amount
  }
  const statementDue = Math.max(0, balanceAtS - paidAfterS)
  const unbilled = outstanding - statementDue
  let dueDate = null, daysToDue = null
  if (dd) {
    const [dy, dm] = dd > bd ? [sy, sm] : shiftMonth(sy, sm, 1)     // due day after the statement day = same month, else next
    dueDate = ymd(dy, dm, dd)
    daysToDue = dayDiff(dueDate, today)
  }
  let status = 'PAID'
  if (statementDue > 0.5) status = daysToDue == null ? 'UPCOMING' : daysToDue < 0 ? 'OVERDUE' : daysToDue <= 5 ? 'DUE_SOON' : 'UPCOMING'
  return { hasCycle: true, statementDate: S, cycleStart: P, nextStatement: N, statementDue, spendsInStatement, unbilled, dueDate, daysToDue, status }
}

function enrich(db, c) {
  const outstanding = outstandingOf(db, c.id)
  const limit = Number(c.credit_limit) || 0
  const available = limit > 0 ? limit - outstanding : null
  const utilization = limit > 0 ? Math.max(0, (outstanding / limit) * 100) : null
  return { ...c, outstanding, available, utilization, last_activity: lastActivityOf(db, c), statement: statementOf(db, c) }
}

module.exports = function registerCardHandlers() {
  const db = getDb()

  ipcMain.handle('card:getAll', () => {
    const cards = db.prepare('SELECT * FROM credit_cards ORDER BY COALESCE(sort_order, 999999), created_at DESC').all()
    return cards.map((c) => enrich(db, c))
  })

  // Portfolio-wide totals across all cards.
  ipcMain.handle('card:totals', () => {
    const cards = db.prepare('SELECT * FROM credit_cards').all()
    let outstanding = 0, limit = 0
    for (const c of cards) { outstanding += outstandingOf(db, c.id); limit += Number(c.credit_limit) || 0 }
    return { count: cards.length, outstanding, limit, available: limit - outstanding, utilization: limit > 0 ? (outstanding / limit) * 100 : 0 }
  })

  ipcMain.handle('card:create', (_, d) => {
    const r = db.prepare(`
      INSERT INTO credit_cards (name, bank, last4, credit_limit, billing_day, due_day, notes)
      VALUES (@name, @bank, @last4, @credit_limit, @billing_day, @due_day, @notes)
    `).run({
      name: d.name, bank: d.bank || null, last4: d.last4 || null,
      credit_limit: Number(d.credit_limit) || 0,
      billing_day: d.billing_day ? Number(d.billing_day) : null,
      due_day: d.due_day ? Number(d.due_day) : null, notes: d.notes || null,
    })
    return enrich(db, db.prepare('SELECT * FROM credit_cards WHERE id=?').get(r.lastInsertRowid))
  })

  ipcMain.handle('card:update', (_, { id, data }) => {
    db.prepare(`
      UPDATE credit_cards SET name=@name, bank=@bank, last4=@last4, credit_limit=@credit_limit,
        billing_day=@billing_day, due_day=@due_day, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({
      name: data.name, bank: data.bank || null, last4: data.last4 || null,
      credit_limit: Number(data.credit_limit) || 0,
      billing_day: data.billing_day ? Number(data.billing_day) : null,
      due_day: data.due_day ? Number(data.due_day) : null, notes: data.notes || null, id,
    })
    return enrich(db, db.prepare('SELECT * FROM credit_cards WHERE id=?').get(id))
  })

  ipcMain.handle('card:delete', (_, id) => { db.prepare('DELETE FROM credit_cards WHERE id=?').run(id); return { success: true } })

  // ---- Card transactions (spends / payments) ----
  ipcMain.handle('card:txns', (_, cardId) => ledgerOf(db, cardId))

  // Log a spend, or a bill payment. A payment made FROM a bank account (account_id) is taken out
  // of that account through the ledger, so it shows on its statement and the balance is right.
  ipcMain.handle('card:addTxn', (_, { card_id, title, amount, category, type, date, notes, account_id }) => {
    const card = db.prepare('SELECT * FROM credit_cards WHERE id=?').get(card_id)
    if (!card) throw new Error('Card not found')
    const amt = Number(amount) || 0
    if (!(amt > 0)) throw new Error('Enter an amount greater than zero')
    const isPay = type === 'PAYMENT'
    const when = date || localToday()
    let accId = null
    if (isPay && account_id) {
      accId = db.prepare('SELECT id FROM bank_accounts WHERE id=?').get(Number(account_id))?.id || null
      if (!accId) throw new Error('That bank account no longer exists')
    }
    db.transaction(() => {
      const r = db.prepare(`INSERT INTO card_transactions (card_id, title, amount, category, type, date, notes, bank_account_id)
        VALUES (?,?,?,?,?,?,?,?)`).run(card_id, title || null, amt, category || null, isPay ? 'PAYMENT' : 'SPEND', when, notes || null, accId)
      if (accId) postBankTxn(db, accId, -amt, { source: 'CARD', note: `Credit card bill: ${card.name}`, refType: 'card_txn', refId: Number(r.lastInsertRowid), date: when })
    })()
    return enrich(db, db.prepare('SELECT * FROM credit_cards WHERE id=?').get(card_id))
  })

  // Deleting a bill payment that came from a bank account gives that money back to the account.
  ipcMain.handle('card:deleteTxn', (_, { id, card_id }) => {
    db.transaction(() => {
      const t = db.prepare('SELECT * FROM card_transactions WHERE id=?').get(id)
      if (t && t.type === 'PAYMENT' && t.bank_account_id) {
        const card = db.prepare('SELECT name FROM credit_cards WHERE id=?').get(t.card_id)
        postBankTxn(db, t.bank_account_id, Number(t.amount) || 0, { source: 'CARD', note: `Card payment removed (refund): ${card?.name || 'card'}`, refType: 'card_txn', refId: id })
      }
      db.prepare('DELETE FROM card_transactions WHERE id=?').run(id)
    })()
    return enrich(db, db.prepare('SELECT * FROM credit_cards WHERE id=?').get(card_id))
  })

  // Where the card money went: by category for the current billing cycle, and month by month.
  ipcMain.handle('card:insights', (_, cardId) => {
    const card = db.prepare('SELECT * FROM credit_cards WHERE id=?').get(cardId)
    if (!card) return null
    const st = statementOf(db, card)
    const rows = ledgerOf(db, cardId).filter((r) => r.type === 'SPEND')
    const from = st.hasCycle ? st.statementDate : null           // current cycle = after the last statement date
    const cat = {}
    let cycleTotal = 0
    for (const r of rows) {
      if (from && r.date <= from) continue
      const k = (r.category || '').trim() || 'Other'
      cat[k] = (cat[k] || 0) + r.amount; cycleTotal += r.amount
    }
    const categories = Object.entries(cat).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
    const today = localToday(); const [ty, tm] = today.split('-').map(Number)
    const months = []
    for (let k = 5; k >= 0; k--) {
      const [y, m] = shiftMonth(ty, tm, -k); const key = `${y}-${pad2(m)}`
      months.push({ ym: key, total: rows.filter((r) => (r.date || '').startsWith(key)).reduce((s, r) => s + r.amount, 0) })
    }
    const top = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5).map((r) => ({ title: r.title, amount: r.amount, date: r.date }))
    return { cycleFrom: from, cycleTotal, categories, months, top }
  })
}

module.exports.outstandingOf = outstandingOf
module.exports.statementOf = statementOf
