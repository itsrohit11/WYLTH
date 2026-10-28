const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn, localToday } = require('../lib/ledger')

module.exports = function registerBankHandlers() {
  const db = getDb()

  // Balances are plain and manual. Each category's total is simply the SUM (tally) of the
  // accounts you assigned to that purpose — nothing is auto-added or auto-subtracted. The
  // balance you enter is the truth, so an account's balance == its category's balance.
  ipcMain.handle('bank:getAll', () =>
    db.prepare('SELECT * FROM bank_accounts ORDER BY COALESCE(sort_order, 999999), created_at DESC').all())

  // New account starts at 0 and the opening balance is posted as the first statement entry.
  ipcMain.handle('bank:create', (_, d) => {
    const create = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO bank_accounts (name, bank, account_number, balance, purpose, notes)
        VALUES (@name, @bank, @account_number, 0, @purpose, @notes)
      `).run({
        name: d.name, bank: d.bank || null, account_number: d.account_number || null,
        purpose: d.purpose || 'OTHER', notes: d.notes || null,
      })
      const id = Number(r.lastInsertRowid)
      postBankTxn(db, id, Number(d.balance) || 0, { source: 'OPENING', note: 'Opening balance' })
      return id
    })
    return db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(create())
  })

  // Editing the balance directly is recorded as an ADJUSTMENT entry for the difference, so the
  // statement always explains the balance.
  ipcMain.handle('bank:update', (_, { id, data }) => {
    const update = db.transaction(() => {
      const old = db.prepare('SELECT balance FROM bank_accounts WHERE id=?').get(id)
      db.prepare(`
        UPDATE bank_accounts SET name=@name, bank=@bank, account_number=@account_number,
          purpose=@purpose, notes=@notes, updated_at=datetime('now')
        WHERE id=@id
      `).run({
        name: data.name, bank: data.bank || null, account_number: data.account_number || null,
        purpose: data.purpose || 'OTHER', notes: data.notes || null, id,
      })
      const diff = Math.round(((Number(data.balance) || 0) - (Number(old?.balance) || 0)) * 100) / 100
      if (diff) postBankTxn(db, id, diff, { source: 'ADJUSTMENT', note: 'Balance edited manually' })
    })
    update()
    return db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id)
  })

  // Quick credit/debit: add to (CREDIT) or subtract from (DEBIT) an account's balance.
  ipcMain.handle('bank:adjust', (_, { id, amount, type, note, date }) => {
    const delta = (type === 'DEBIT' ? -1 : 1) * (Number(amount) || 0)
    postBankTxn(db, id, delta, { source: 'MANUAL', note: note || (delta < 0 ? 'Withdrawal' : 'Deposit'), date: date || null })
    return db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id)
  })

  // Statement for one account, newest first. Optional month filter 'YYYY-MM'.
  ipcMain.handle('bank:statement', (_, { id, ym } = {}) => {
    const rows = ym
      ? db.prepare("SELECT * FROM bank_transactions WHERE account_id=? AND substr(date,1,7)=? ORDER BY id DESC").all(id, ym)
      : db.prepare('SELECT * FROM bank_transactions WHERE account_id=? ORDER BY id DESC').all(id)
    const months = db.prepare("SELECT DISTINCT substr(date,1,7) ym FROM bank_transactions WHERE account_id=? ORDER BY ym DESC").all(id).map(r => r.ym)
    const last = db.prepare('SELECT created_at FROM bank_transactions WHERE account_id=? ORDER BY id DESC LIMIT 1').get(id)
    return { rows, months, lastEntryAt: last?.created_at || null, today: localToday() }
  })

  ipcMain.handle('bank:delete', (_, id) => { db.prepare('DELETE FROM bank_accounts WHERE id=?').run(id); return { success: true } })
}
