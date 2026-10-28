const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn, localToday, primaryExpenseAccount } = require('../lib/ledger')
const { statementOf } = require('./cardHandlers')

// Monthly contribution notifications for investments that have a monthly date set.
//  - SIP: amount auto-grows already; the notice is just an FYI ("X added this month").
//  - Others (PF/PPF/NPS...): "Accept" adds the amount to invested AND current value.
module.exports = function registerNotificationHandlers() {
  const db = getDb()

  ipcMain.handle('notification:pending', () => {
    const now = new Date()
    const curM = now.getMonth() + 1, curY = now.getFullYear(), curD = now.getDate()
    const todayStr = `${curY}-${String(curM).padStart(2, '0')}-${String(curD).padStart(2, '0')}`
    const invs = db.prepare(`SELECT * FROM investments WHERE auto_day IS NOT NULL AND auto_day > 0 AND status='ACTIVE' AND COALESCE(sip_mode,'MONTHLY')<>'LUMPSUM'`).all()
    const out = []
    for (const inv of invs) {
      const amount = inv.type === 'SIP' ? (inv.sip_amount || 0) : (inv.auto_amount || 0)
      if (!(amount > 0)) continue
      if (curD < inv.auto_day) continue
      const done = db.prepare('SELECT 1 FROM contribution_log WHERE investment_id=? AND month=? AND year=?').get(inv.id, curM, curY)
      if (done) continue
      // SIP: "Not yet" dismisses only for today, so the reminder returns the next day.
      if (inv.type === 'SIP') {
        const later = db.prepare("SELECT 1 FROM reminder_ack WHERE kind='SIP_DUE' AND ref_id=? AND period=?").get(inv.id, todayStr)
        if (later) continue
      }
      out.push({ investment_id: inv.id, title: inv.title, type: inv.type, amount, month: curM, year: curY,
        kind: inv.type === 'SIP' ? 'SIP' : 'CONTRIBUTION', day: inv.auto_day })
    }

    // SIP NAV prompt: once a SIP is approved for the month, ask for the current NAV + units
    // 2 days after the scheduled payment, so P&L reflects real market value.
    const sipInvs = db.prepare("SELECT * FROM investments WHERE type='SIP' AND auto_day IS NOT NULL AND auto_day > 0 AND status='ACTIVE' AND COALESCE(sip_mode,'MONTHLY')<>'LUMPSUM'").all()
    for (const inv of sipInvs) {
      const period = `${curY}-${String(curM).padStart(2, '0')}`
      const paid = db.prepare('SELECT 1 FROM contribution_log WHERE investment_id=? AND month=? AND year=?').get(inv.id, curM, curY)
      if (!paid) continue                                   // wait until you've approved this month's SIP
      const promptDay = Math.min(inv.auto_day, 26) + 2      // ~2 days after the payment
      if (curD < promptDay) continue
      const has = db.prepare('SELECT 1 FROM sip_nav WHERE investment_id=? AND ym=?').get(inv.id, period)
      if (has) continue
      if (db.prepare("SELECT 1 FROM reminder_ack WHERE kind='SIP_NAV' AND ref_id=? AND period=?").get(inv.id, period)) continue   // dismissed
      out.push({ kind: 'SIP_NAV', investment_id: inv.id, title: inv.title, ym: period, month: curM, year: curY })
    }

    // Monthly subscription/bill reminders (due_day reached this month, not yet acknowledged).
    const period = `${curY}-${String(curM).padStart(2, '0')}`
    const monthlyBills = db.prepare('SELECT * FROM bills WHERE monthly=1 AND due_day IS NOT NULL AND due_day > 0').all()
    for (const r of monthlyBills) {
      if (curD < r.due_day) continue
      const ack = db.prepare("SELECT 1 FROM reminder_ack WHERE kind='RECURRING' AND ref_id=? AND period=?").get(r.id, period)
      if (ack) continue
      out.push({ kind: 'RECURRING', ref_id: r.id, title: r.title, amount: r.amount, note: r.notes || '', period, day: r.due_day })
    }

    // One-time bill reminders (bill date reached, not yet acknowledged).
    const bills = db.prepare("SELECT * FROM bills WHERE (monthly=0 OR monthly IS NULL) AND date <= ?").all(todayStr)
    for (const b of bills) {
      const ack = db.prepare("SELECT 1 FROM reminder_ack WHERE kind='BILL' AND ref_id=? AND period='once'").get(b.id)
      if (ack) continue
      out.push({ kind: 'BILL', ref_id: b.id, title: b.title, amount: b.amount, note: b.notes || '', period: 'once', date: b.date })
    }

    // Credit-card bills: from 5 days before the due date until the statement is paid. "Got it"
    // only snoozes it for today, so an unpaid or overdue bill comes back tomorrow.
    const cards = db.prepare('SELECT * FROM credit_cards').all()
    for (const c of cards) {
      const st = statementOf(db, c, todayStr)
      if (!(st.statementDue > 0.5)) continue
      if (st.daysToDue == null || st.daysToDue > 5) continue
      const ack = db.prepare("SELECT 1 FROM reminder_ack WHERE kind='CARD' AND ref_id=? AND period=?").get(c.id, todayStr)
      if (ack) continue
      out.push({ kind: 'CARD', ref_id: c.id, title: c.name, amount: st.statementDue, note: '', period: todayStr,
        day: c.due_day, dueDate: st.dueDate, daysToDue: st.daysToDue })
    }

    return out
  })

  // "Paid": a bill reminder that was actually paid. Logs it as an expense, takes the money out of
  // your Expense account (so rent / utilities and daily spends come from the same balance), and
  // dismisses the reminder -- all in one step.
  ipcMain.handle('notification:payBill', (_, { kind, ref_id, period, account_id } = {}) => {
    const bill = db.prepare('SELECT * FROM bills WHERE id=?').get(ref_id)
    if (!bill) return { ok: false }
    const already = db.prepare('SELECT 1 FROM reminder_ack WHERE kind=? AND ref_id=? AND period=?').get(kind, ref_id, period)
    if (already) return { ok: true, already: true }
    const accId = (account_id && db.prepare('SELECT 1 FROM bank_accounts WHERE id=?').get(Number(account_id)) ? Number(account_id) : null) || primaryExpenseAccount(db)
    const amount = Number(bill.amount) || 0
    let debited = 0
    db.transaction(() => {
      const date = localToday()
      const exp = db.prepare(`INSERT INTO expenses (title, amount, category, category_name, date, notes, payment_method, is_recurring, debit_account_id)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(bill.title, amount, 'NEED', 'Bills', date, bill.notes || null, 'AUTO', kind === 'RECURRING' ? 1 : 0, accId)
      if (accId) { postBankTxn(db, accId, -amount, { source: 'EXPENSE', note: `Bill paid: ${bill.title}`, refType: 'expense', refId: Number(exp.lastInsertRowid), date }); debited = amount }
      db.prepare('INSERT OR IGNORE INTO reminder_ack (kind, ref_id, period) VALUES (?,?,?)').run(kind, ref_id, period)
    })()
    return { ok: true, debited }
  })

  ipcMain.handle('notification:ackReminder', (_, { kind, ref_id, period }) => {
    db.prepare("INSERT OR IGNORE INTO reminder_ack (kind, ref_id, period) VALUES (?,?,?)").run(kind, ref_id, period)
    return { ok: true }
  })

  // "Yes, debited": a SIP's invested amount already auto-grows, so we only DEBIT the SIP
  // amount from the savings pool (the money for the SIP lives in savings). For PF/PPF-style
  // monthly contributions, "Accept" adds the amount to invested + current value.
  ipcMain.handle('notification:accept', (_, { investment_id, month, year }) => {
    const inv = db.prepare('SELECT * FROM investments WHERE id=?').get(investment_id)
    if (!inv) return { ok: false }
    const amount = inv.type === 'SIP' ? (inv.sip_amount || 0) : (inv.auto_amount || 0)
    const r = db.prepare('INSERT OR IGNORE INTO contribution_log (investment_id, month, year, amount, applied) VALUES (?,?,?,?,1)')
      .run(investment_id, month, year, amount)
    if (r.changes === 0) return { ok: true }  // already handled this month — don't apply twice
    if (inv.type === 'SIP') {
      // The SIP money comes out of your SAVINGS bank account (that's where the savings balance
      // lives), and it shows on that account's statement.
      let accId = null
      if (amount > 0) {
        accId = db.prepare("SELECT id FROM bank_accounts WHERE purpose='SAVINGS' ORDER BY COALESCE(sort_order,999999), created_at DESC LIMIT 1").get()?.id || null
        postBankTxn(db, accId, -amount, { source: 'SIP', refType: 'investment', refId: investment_id,
          note: `SIP debit: ${inv.title} (${month}/${year})` })
      }
      return { ok: true, debited: amount, account_id: accId }
    }
    if (amount > 0) {
      db.prepare(`UPDATE investments SET invested_amount = COALESCE(invested_amount,0)+?,
        current_value = COALESCE(current_value,0)+?, updated_at=datetime('now') WHERE id=?`).run(amount, amount, investment_id)
    }
    return { ok: true }
  })

  ipcMain.handle('notification:skip', (_, { investment_id, month, year }) => {
    db.prepare('INSERT OR IGNORE INTO contribution_log (investment_id, month, year, amount, applied) VALUES (?,?,?,0,0)')
      .run(investment_id, month, year)
    return { ok: true }
  })

  // "Not yet": suppress a SIP reminder for today only; it returns the next day.
  ipcMain.handle('notification:remindLater', (_, { investment_id }) => {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    db.prepare("INSERT OR IGNORE INTO reminder_ack (kind, ref_id, period) VALUES ('SIP_DUE', ?, ?)").run(investment_id, todayStr)
    return { ok: true }
  })
}
