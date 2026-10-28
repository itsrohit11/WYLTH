const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn, localToday, primaryExpenseAccount } = require('../lib/ledger')

// Fixed recurring expenses (rent, EMI, grocery, maid, cook, bills...). A reference list
// of monthly commitments; it does not auto-create expense entries.
module.exports = function registerRecurringHandlers() {
  const db = getDb()

  ipcMain.handle('recurring:getAll', () => db.prepare('SELECT * FROM recurring_expenses ORDER BY COALESCE(sort_order, 999999), active DESC, amount DESC').all())

  ipcMain.handle('recurring:create', (_, d) => {
    const r = db.prepare(`
      INSERT INTO recurring_expenses (title, category, amount, due_day, active, notes)
      VALUES (@title, @category, @amount, @due_day, @active, @notes)
    `).run({
      title: d.title, category: d.category || 'OTHER', amount: Number(d.amount) || 0,
      due_day: d.due_day ? Number(d.due_day) : null, active: d.active === false ? 0 : 1, notes: d.notes || null,
    })
    return db.prepare('SELECT * FROM recurring_expenses WHERE id=?').get(r.lastInsertRowid)
  })

  ipcMain.handle('recurring:update', (_, { id, data }) => {
    db.prepare(`
      UPDATE recurring_expenses SET title=@title, category=@category, amount=@amount,
        due_day=@due_day, active=@active, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({
      title: data.title, category: data.category || 'OTHER', amount: Number(data.amount) || 0,
      due_day: data.due_day ? Number(data.due_day) : null, active: data.active === false ? 0 : 1, notes: data.notes || null, id,
    })
    return db.prepare('SELECT * FROM recurring_expenses WHERE id=?').get(id)
  })

  ipcMain.handle('recurring:delete', (_, id) => { db.prepare('DELETE FROM recurring_expenses WHERE id=?').run(id); return { success: true } })

  // ---- Mark a recurring item as paid for a month: posts a real expense and records it. ----
  const curPeriod = () => localToday().slice(0, 7)

  // Which recurring items are already paid in the current month.
  ipcMain.handle('recurring:paidStatus', () => {
    const rows = db.prepare('SELECT recurring_id, period, expense_id, amount, paid_date FROM recurring_payments WHERE period=?').all(curPeriod())
    const map = {}
    for (const r of rows) map[r.recurring_id] = r
    return map
  })

  // Create an expense for this recurring item, take the money out of the bank account, and mark
  // it paid for the current month. All of it happens together or not at all.
  ipcMain.handle('recurring:markPaid', (_, { id, date, account_id } = {}) => {
    const rec = db.prepare('SELECT * FROM recurring_expenses WHERE id=?').get(id)
    if (!rec) throw new Error('Recurring item not found')
    const period = curPeriod()
    const existing = db.prepare('SELECT * FROM recurring_payments WHERE recurring_id=? AND period=?').get(id, period)
    if (existing) return { ok: true, already: true }
    // Default the expense date to the due day of the current month, else today.
    let payDate = date
    if (!payDate) payDate = rec.due_day ? `${period}-${String(rec.due_day).padStart(2, '0')}` : localToday()
    const accId = (account_id && db.prepare('SELECT 1 FROM bank_accounts WHERE id=?').get(Number(account_id)) ? Number(account_id) : null) || primaryExpenseAccount(db)
    let expenseId = null
    db.transaction(() => {
      const exp = db.prepare(`
        INSERT INTO expenses (title, amount, category, category_name, date, notes, payment_method, is_recurring, debit_account_id)
        VALUES (?,?,?,?,?,?,?,1,?)
      `).run(rec.title, rec.amount, 'NEED', rec.category || null, payDate, rec.notes || null, 'AUTO', accId)
      expenseId = Number(exp.lastInsertRowid)
      if (accId) postBankTxn(db, accId, -(Number(rec.amount) || 0), { source: 'EXPENSE', note: `Recurring paid: ${rec.title}`, refType: 'expense', refId: expenseId, date: payDate })
      db.prepare(`INSERT INTO recurring_payments (recurring_id, period, expense_id, amount, paid_date) VALUES (?,?,?,?,?)`)
        .run(id, period, expenseId, rec.amount, payDate)
    })()
    const acc = accId ? db.prepare('SELECT name, balance FROM bank_accounts WHERE id=?').get(accId) : null
    return { ok: true, expense_id: expenseId, period, debited: accId ? Number(rec.amount) || 0 : 0, account: acc }
  })

  // Undo: remove the created expense, give the money back to the account it came from, and clear
  // the paid record for the current month.
  ipcMain.handle('recurring:unmarkPaid', (_, { id } = {}) => {
    const period = curPeriod()
    const row = db.prepare('SELECT * FROM recurring_payments WHERE recurring_id=? AND period=?').get(id, period)
    if (!row) return { ok: true }
    db.transaction(() => {
      if (row.expense_id) {
        const e = db.prepare('SELECT title, amount, debit_account_id, deleted_at FROM expenses WHERE id=?').get(row.expense_id)
        if (e && e.debit_account_id && !e.deleted_at) {
          postBankTxn(db, e.debit_account_id, Number(e.amount) || 0, { source: 'EXPENSE', note: `Recurring payment undone (refund): ${e.title}`, refType: 'expense', refId: row.expense_id })
        }
        db.prepare('DELETE FROM expenses WHERE id=?').run(row.expense_id)
      }
      db.prepare('DELETE FROM recurring_payments WHERE id=?').run(row.id)
    })()
    return { ok: true }
  })
}
