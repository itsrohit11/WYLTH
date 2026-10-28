const { ipcMain } = require('electron')
const { getDb } = require('../database')

// Net worth = all bank accounts (your money, tallied) + portfolio current value
// + money owed to you − money you owe. Emergency and Savings are just categories WITHIN
// the bank total, so they're captured by `bank` and never added again (no double-count).
function computeNetWorth(db) {
  const t = (sql) => db.prepare(sql).get()?.t || 0
  const bank = t('SELECT COALESCE(SUM(balance),0) t FROM bank_accounts')
  const investments = t("SELECT COALESCE(SUM(COALESCE(current_value,invested_amount)),0) t FROM investments WHERE status='ACTIVE'")
  const emergency = t("SELECT COALESCE(SUM(balance),0) t FROM bank_accounts WHERE purpose='EMERGENCY'")
  const receivable = t("SELECT COALESCE(SUM(amount),0) t FROM loans WHERE kind='LEND' AND settled=0")
  const loanDebt = t("SELECT COALESCE(SUM(amount),0) t FROM loans WHERE kind='DEBT' AND settled=0")
  const cardDebt = t("SELECT COALESCE(SUM(CASE WHEN type='PAYMENT' THEN -amount ELSE amount END),0) t FROM card_transactions")
  const debt = loanDebt + cardDebt   // total money owed (loans borrowed + credit-card outstanding)
  // Broker cash you haven't invested yet is real money you hold, but it lives outside
  // bank_accounts — so it has to be added explicitly (once invested it counts under
  // `investments` instead, which is why marking invested leaves net worth unchanged).
  const dematCash = t('SELECT COALESCE(SUM(amount),0) t FROM demat_funds WHERE invested=0 AND deleted_at IS NULL')
  const savings = t("SELECT COALESCE(SUM(balance),0) t FROM bank_accounts WHERE purpose='SAVINGS'") + dematCash
  const net_worth = bank + dematCash + investments + receivable - debt
  return { net_worth, bank, investments, emergency, savings, receivable, debt, cardDebt, dematCash }
}

// Upsert a snapshot for the current calendar month: past months stay frozen, the current
// month keeps refreshing to the latest value on each launch.
function snapshot(db) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const date = now.toISOString().split('T')[0]
  const v = computeNetWorth(db)
  db.prepare(`
    INSERT INTO net_worth_snapshots (ym, date, net_worth, bank, investments, emergency, savings, receivable, debt)
    VALUES (@ym, @date, @net_worth, @bank, @investments, @emergency, @savings, @receivable, @debt)
    ON CONFLICT(ym) DO UPDATE SET date=@date, net_worth=@net_worth, bank=@bank, investments=@investments,
      emergency=@emergency, savings=@savings, receivable=@receivable, debt=@debt
  `).run({ ym, date, ...v })
  return { ym, date, ...v }
}

module.exports = function registerNetWorthHandlers() {
  const db = getDb()
  try { snapshot(db) } catch (e) { console.warn('net worth snapshot failed:', e.message) }

  ipcMain.handle('networth:current', () => computeNetWorth(db))
  ipcMain.handle('networth:history', () => db.prepare('SELECT * FROM net_worth_snapshots ORDER BY ym ASC').all())
  ipcMain.handle('networth:snapshotNow', () => snapshot(db))
}

module.exports.computeNetWorth = computeNetWorth
