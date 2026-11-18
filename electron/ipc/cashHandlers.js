const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn, postCashTxn, cashBalance, localToday } = require('../lib/ledger')

// Cash in hand. One wallet with its own statement. Moving money between a bank account and cash
// (ATM withdrawal / cash deposit) posts BOTH sides, so net worth stays the same.
module.exports = function registerCashHandlers() {
  const db = getDb()
  const lastEntry = () => db.prepare('SELECT created_at FROM cash_transactions ORDER BY id DESC LIMIT 1').get()?.created_at || null
  const state = () => ({ balance: cashBalance(db), lastEntryAt: lastEntry() })
  const fail = (e) => ({ ok: false, error: e.message })

  ipcMain.handle('cash:get', () => state())

  // Add cash (CREDIT) or spend / take out cash (DEBIT).
  ipcMain.handle('cash:adjust', (_, { amount, type, note, date } = {}) => {
    try {
      const amt = Number(amount) || 0
      if (!(amt > 0)) throw new Error('Enter an amount greater than 0')
      const delta = type === 'DEBIT' ? -amt : amt
      db.transaction(() => {
        if (delta < 0 && cashBalance(db) + delta < -0.005) throw new Error(`You only have ₹${cashBalance(db)} in cash`)
        postCashTxn(db, delta, { source: 'MANUAL', note: note || (delta < 0 ? 'Cash spent' : 'Cash added'), date: date || null })
      })()
      return { ok: true, ...state() }
    } catch (e) { return fail(e) }
  })

  // Correct the balance to what is actually in your wallet; the difference is logged.
  ipcMain.handle('cash:setBalance', (_, { balance, note, date } = {}) => {
    try {
      const target = Number(balance)
      if (!isFinite(target) || target < 0) throw new Error('Enter the cash you actually have (0 or more)')
      db.transaction(() => {
        const diff = Math.round((target - cashBalance(db)) * 100) / 100
        if (diff) postCashTxn(db, diff, { source: 'ADJUSTMENT', note: note || 'Balance corrected manually', date: date || null })
      })()
      return { ok: true, ...state() }
    } catch (e) { return fail(e) }
  })

  // BANK_TO_CASH: you took cash out of an account.  CASH_TO_BANK: you deposited cash.
  ipcMain.handle('cash:transfer', (_, { account_id, amount, direction, note, date } = {}) => {
    try {
      const amt = Number(amount) || 0
      if (!(amt > 0)) throw new Error('Enter an amount greater than 0')
      const acc = db.prepare('SELECT id, name, bank FROM bank_accounts WHERE id=?').get(account_id)
      if (!acc) throw new Error('Pick a bank account')
      const accName = acc.bank || acc.name
      const toCash = direction !== 'CASH_TO_BANK'
      db.transaction(() => {
        if (!toCash && cashBalance(db) - amt < -0.005) throw new Error(`You only have ₹${cashBalance(db)} in cash`)
        postBankTxn(db, acc.id, toCash ? -amt : amt, {
          source: 'TRANSFER', refType: 'cash', date: date || null,
          note: note || (toCash ? 'Withdrawn as cash' : 'Cash deposited'),
        })
        postCashTxn(db, toCash ? amt : -amt, {
          source: 'TRANSFER', refType: 'bank', refId: acc.id, date: date || null,
          note: note || (toCash ? `Withdrawn from ${accName}` : `Deposited to ${accName}`),
        })
      })()
      return { ok: true, ...state() }
    } catch (e) { return fail(e) }
  })

  // Statement, newest first. Optional month filter 'YYYY-MM'.
  ipcMain.handle('cash:statement', (_, { ym } = {}) => {
    const rows = ym
      ? db.prepare("SELECT * FROM cash_transactions WHERE substr(date,1,7)=? ORDER BY id DESC").all(ym)
      : db.prepare('SELECT * FROM cash_transactions ORDER BY id DESC').all()
    const months = db.prepare("SELECT DISTINCT substr(date,1,7) ym FROM cash_transactions ORDER BY ym DESC").all().map(r => r.ym)
    return { rows, months, lastEntryAt: lastEntry(), today: localToday() }
  })
}
