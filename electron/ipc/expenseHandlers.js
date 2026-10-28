const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn } = require('../lib/ledger')

module.exports = function registerExpenseHandlers() {
  const db = getDb()

  // Expenses auto-debit your primary EXPENSE bank account so its balance reflects spending
  // (goes negative = overspend). We remember which account was debited so edits/deletes reverse it.
  const primaryExpenseAccount = () =>
    db.prepare("SELECT id FROM bank_accounts WHERE purpose='EXPENSE' ORDER BY COALESCE(sort_order,999999), created_at DESC LIMIT 1").get()?.id || null
  // Every balance change is posted to the bank statement with the expense it came from.
  const adjustAccount = (accId, delta, note, expenseId) =>
    postBankTxn(db, accId, delta, { source: 'EXPENSE', note, refType: 'expense', refId: expenseId })

  // Does this payment method take money out of a bank account? CASH comes from your wallet and
  // CARD goes onto the credit card, so neither touches the bank. Everything else does.
  const hitsBank = (method) => method !== 'CASH' && method !== 'CARD'
  const accountExists = (id) => id && db.prepare('SELECT 1 FROM bank_accounts WHERE id=?').get(Number(id)) ? Number(id) : null

  // Only live (not soft-deleted) rows count anywhere. Deleted rows keep their data so a delete
  // can be undone, but they must never appear in lists or totals.
  ipcMain.handle('expense:getAll', (_, { month, year } = {}) => {
    if (month && year) {
      const mo = String(month).padStart(2, '0')
      const yr = String(year)
      return db.prepare(
        `SELECT * FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND deleted_at IS NULL ORDER BY date DESC`
      ).all(mo, yr)
    }
    return db.prepare('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC').all()
  })

  ipcMain.handle('expense:getRecent', () => {
    return db.prepare('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC LIMIT 10').all()
  })

  // Per-month totals across all live expenses (for the Monthly Spending view).
  ipcMain.handle('expense:monthTotals', () => {
    return db.prepare(`
      SELECT strftime('%Y', date) AS year, strftime('%m', date) AS month,
             COALESCE(SUM(amount),0) AS total, COUNT(*) AS count,
             COALESCE(SUM(CASE WHEN category='NEED' THEN amount ELSE 0 END),0) AS needs,
             COALESCE(SUM(CASE WHEN category='WANT' THEN amount ELSE 0 END),0) AS wants
      FROM expenses
      WHERE deleted_at IS NULL
      GROUP BY year, month
      ORDER BY year DESC, month DESC
    `).all()
  })

  ipcMain.handle('expense:create', (_, data) => {
    // All three writes (insert row, debit the account, remember which account) happen as one
    // atomic unit, so a crash can never leave the row and the balance out of sync.
    const create = db.transaction((d) => {
      const result = db.prepare(`
        INSERT INTO expenses (title, amount, category, category_name, date, notes, payment_method, salary_allocation_id, is_recurring, card_id)
        VALUES (@title, @amount, @category, @category_name, @date, @notes, @payment_method, @salary_allocation_id, @is_recurring, @card_id)
      `).run({
        title: d.title,
        amount: d.amount,
        category: d.category,
        category_name: d.category_name || null,
        date: d.date,
        notes: d.notes || null,
        payment_method: d.payment_method || 'UPI',
        salary_allocation_id: d.salary_allocation_id || null,
        is_recurring: d.is_recurring ? 1 : 0,
        card_id: d.payment_method === 'CARD' && d.card_id ? Number(d.card_id) : null,
      })
      // Only money that actually leaves the Expense account debits it: UPI / bank transfer /
      // netbanking. CASH comes from physical cash, and CARD spends go to the credit card —
      // neither should reduce the Expense account balance.
      const accId = hitsBank(d.payment_method) ? (accountExists(d.account_id) || primaryExpenseAccount()) : null
      if (accId) {
        adjustAccount(accId, -(Number(d.amount) || 0), `Expense: ${d.title}`, Number(result.lastInsertRowid))
        db.prepare('UPDATE expenses SET debit_account_id=? WHERE id=?').run(accId, result.lastInsertRowid)
      }
      return result.lastInsertRowid
    })
    const id = create(data)
    return db.prepare('SELECT * FROM expenses WHERE id=?').get(id)
  })

  ipcMain.handle('expense:update', (_, { id, data }) => {
    const update = db.transaction((d) => {
      const old = db.prepare('SELECT amount, debit_account_id, payment_method, date, title FROM expenses WHERE id=?').get(id)
      if (!old) return
      const method = d.payment_method || 'UPI'
      db.prepare(`
        UPDATE expenses SET title=@title, amount=@amount, category=@category, category_name=@category_name,
          date=@date, notes=@notes, payment_method=@payment_method, is_recurring=@is_recurring,
          updated_at=datetime('now')
        WHERE id=@id
      `).run({
        title: d.title, amount: d.amount, category: d.category,
        category_name: d.category_name || null, date: d.date,
        notes: d.notes || null, payment_method: method,
        is_recurring: d.is_recurring ? 1 : 0, id,
      })
      // Re-settle against the bank so the balance always matches what the expense now says:
      // the amount, the payment method (UPI -> Cash gives the money back; Cash -> UPI debits it)
      // and the account it was paid from can all change.
      const oldAcc = old.debit_account_id || null
      const oldAmt = Number(old.amount) || 0
      const newAmt = Number(d.amount) || 0
      const newAcc = hitsBank(method) ? (accountExists(d.account_id) || oldAcc || primaryExpenseAccount()) : null
      if (oldAcc && newAcc && oldAcc === newAcc) {
        const diff = newAmt - oldAmt
        if (diff) adjustAccount(oldAcc, -diff, `Expense edited: ${d.title}`, id)
      } else {
        if (oldAcc) adjustAccount(oldAcc, oldAmt, `Expense edited (moved/refunded): ${d.title}`, id)
        if (newAcc) adjustAccount(newAcc, -newAmt, `Expense edited: ${d.title}`, id)
      }
      db.prepare('UPDATE expenses SET debit_account_id=? WHERE id=?').run(newAcc, id)
    })
    update(data)
    return db.prepare('SELECT * FROM expenses WHERE id=?').get(id)
  })

  // Soft delete: give back any money this expense debited and mark the row deleted. The row
  // stays in the database so it can be restored from Trash (nothing is truly lost here).
  ipcMain.handle('expense:delete', (_, id) => {
    const softDelete = db.transaction(() => {
      const exp = db.prepare('SELECT title, amount, debit_account_id, deleted_at FROM expenses WHERE id=?').get(id)
      if (!exp || exp.deleted_at) return
      if (exp.debit_account_id) adjustAccount(exp.debit_account_id, Number(exp.amount) || 0, `Expense deleted (refund): ${exp.title}`, id) // refund the account
      db.prepare("UPDATE expenses SET deleted_at=datetime('now') WHERE id=?").run(id)
    })
    softDelete()
    return { success: true }
  })

  // Bring a soft-deleted expense back exactly as it was, re-applying its account debit.
  ipcMain.handle('expense:restore', (_, id) => {
    const restore = db.transaction(() => {
      const exp = db.prepare('SELECT title, amount, debit_account_id, deleted_at FROM expenses WHERE id=?').get(id)
      if (!exp || !exp.deleted_at) return
      if (exp.debit_account_id) adjustAccount(exp.debit_account_id, -(Number(exp.amount) || 0), `Expense restored: ${exp.title}`, id) // re-debit
      db.prepare('UPDATE expenses SET deleted_at=NULL WHERE id=?').run(id)
    })
    restore()
    return db.prepare('SELECT * FROM expenses WHERE id=?').get(id)
  })

  // Everything currently in the Trash (soft-deleted), newest first.
  ipcMain.handle('expense:trashList', () => {
    return db.prepare('SELECT * FROM expenses WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all()
  })

  // Permanently remove an already-trashed row. The account was already refunded at delete time,
  // so this only drops the row. Guarded to trashed rows so a live expense can't be hard-deleted.
  ipcMain.handle('expense:purge', (_, id) => {
    db.prepare('DELETE FROM expenses WHERE id=? AND deleted_at IS NOT NULL').run(id)
    return { success: true }
  })

  // ---- Repair for old entries ----
  // Expenses that say they were paid from a bank (UPI / transfer / auto) but never took the
  // money out of any account -- e.g. rent or utilities logged with "Mark paid" in older versions.
  ipcMain.handle('expense:unsettled', () => {
    const rows = db.prepare(`
      SELECT id, title, amount, date, payment_method, category_name FROM expenses
      WHERE deleted_at IS NULL AND debit_account_id IS NULL
        AND COALESCE(payment_method,'UPI') NOT IN ('CASH','CARD')
      ORDER BY date DESC, id DESC`).all()
    const accId = primaryExpenseAccount()
    const acc = accId ? db.prepare('SELECT id, name, balance FROM bank_accounts WHERE id=?').get(accId) : null
    return { rows, total: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), account: acc }
  })

  // Take the chosen entries out of the account now (dated on the expense's own date, so the
  // statement reads correctly). Entries you leave out stay untouched.
  ipcMain.handle('expense:settleUnsettled', (_, { ids, account_id } = {}) => {
    const accId = accountExists(account_id) || primaryExpenseAccount()
    if (!accId) throw new Error('No bank account to debit. Add one in Bank first.')
    const list = (ids || []).map(Number).filter(Boolean)
    let count = 0, total = 0
    db.transaction(() => {
      for (const id of list) {
        const e = db.prepare("SELECT id, title, amount, date FROM expenses WHERE id=? AND deleted_at IS NULL AND debit_account_id IS NULL AND COALESCE(payment_method,'UPI') NOT IN ('CASH','CARD')").get(id)
        if (!e) continue
        postBankTxn(db, accId, -(Number(e.amount) || 0), { source: 'EXPENSE', note: `Expense (settled later): ${e.title}`, refType: 'expense', refId: e.id, date: e.date })
        db.prepare('UPDATE expenses SET debit_account_id=? WHERE id=?').run(accId, e.id)
        count++; total += Number(e.amount) || 0
      }
    })()
    return { count, total, account_id: accId }
  })
}
