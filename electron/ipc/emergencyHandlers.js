const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn } = require('../lib/ledger')

function enrichFund(row) {
  if (!row) return null
  const pct = row.target_amount > 0
    ? ((row.current_amount / row.target_amount) * 100).toFixed(2)
    : 0
  const remaining = row.target_amount - row.current_amount
  const monthsToComplete = row.monthly_contribution > 0 && remaining > 0
    ? Math.ceil(remaining / row.monthly_contribution)
    : null
  const actualMonthsCovered = row.monthly_expenses > 0
    ? Number((row.current_amount / row.monthly_expenses).toFixed(1))
    : null
  return { ...row, completionPercentage: parseFloat(pct), remainingAmount: remaining, monthsToComplete, actualMonthsCovered }
}

module.exports = function registerEmergencyHandlers() {
  const db = getDb()

  // The emergency fund IS the money in your EMERGENCY bank account(s): one number, two views.
  // Whenever such an account exists, the fund's balance is read straight from it (and saved
  // back into the fund row), so the Bank tab and this tab can never disagree -- whether the money
  // moved here, on the Bank tab, or through any other part of the app.
  const emergencyAccounts = () =>
    db.prepare("SELECT id, name, bank, balance FROM bank_accounts WHERE purpose='EMERGENCY' ORDER BY COALESCE(sort_order,999999), created_at DESC").all()

  // Reads the fund, syncs its balance to the linked account(s) and attaches the link details.
  const loadFund = () => {
    let row = db.prepare('SELECT * FROM emergency_fund ORDER BY created_at DESC LIMIT 1').get()
    const accs = emergencyAccounts()
    if (row && accs.length) {
      const total = accs.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      if (Number(row.current_amount) !== total) {
        db.prepare("UPDATE emergency_fund SET current_amount=? WHERE id=?").run(total, row.id)
        row = { ...row, current_amount: total }
      }
    }
    if (!row) return null
    return { ...enrichFund(row), linked: accs.length > 0, accounts: accs, account: accs[0] || null }
  }

  ipcMain.handle('emergency:get', () => loadFund())

  ipcMain.handle('emergency:save', (_, data) => {
    const existing = db.prepare('SELECT * FROM emergency_fund ORDER BY created_at DESC LIMIT 1').get()
    const linked = emergencyAccounts().length > 0
    if (existing) {
      // Merge with the existing row so fields the setup form does not send are preserved.
      // When linked to a bank account the balance is never typed in: it comes from the account.
      const merged = {
        target_amount: data.target_amount ?? existing.target_amount,
        current_amount: linked ? existing.current_amount : (data.current_amount ?? existing.current_amount),
        monthly_contribution: data.monthly_contribution ?? existing.monthly_contribution,
        monthly_expenses: data.monthly_expenses ?? existing.monthly_expenses,
        months_covered: data.months_covered ?? existing.months_covered,
        notes: data.notes ?? existing.notes,
        id: existing.id,
      }
      db.prepare(`
        UPDATE emergency_fund SET target_amount=@target_amount, current_amount=@current_amount,
          monthly_contribution=@monthly_contribution, monthly_expenses=@monthly_expenses,
          months_covered=@months_covered, notes=@notes, updated_at=datetime('now')
        WHERE id=@id
      `).run(merged)
    } else {
      db.prepare(`
        INSERT INTO emergency_fund (target_amount, current_amount, monthly_contribution, monthly_expenses, months_covered, notes)
        VALUES (@target_amount, @current_amount, @monthly_contribution, @monthly_expenses, @months_covered, @notes)
      `).run({
        target_amount: data.target_amount, current_amount: linked ? 0 : (data.current_amount || 0),
        monthly_contribution: data.monthly_contribution || 0,
        monthly_expenses: data.monthly_expenses || null,
        months_covered: data.months_covered || 6, notes: data.notes || null,
      })
    }
    return loadFund()
  })

  // Add / withdraw (amount may be negative). With a linked account this moves real money in that
  // account and appears on its statement; a withdrawal can't take the account below zero.
  ipcMain.handle('emergency:addContribution', (_, { id, amount, note, date }) => {
    const fund = db.prepare('SELECT * FROM emergency_fund WHERE id=?').get(id)
    if (!fund) throw new Error('Emergency fund not found')
    const amt = parseFloat(amount) || 0
    if (!amt) return loadFund()
    const accs = emergencyAccounts()
    if (accs.length) {
      const acc = accs[0]
      if (amt < 0 && (Number(acc.balance) || 0) + amt < 0) {
        throw new Error(`Only ${Number(acc.balance).toLocaleString('en-IN')} is available in ${acc.name}`)
      }
      db.transaction(() => {
        postBankTxn(db, acc.id, amt, { source: 'EMERGENCY', note: note || (amt < 0 ? 'Withdrawn from emergency fund' : 'Added to emergency fund'), date: date || null })
        db.prepare("UPDATE emergency_fund SET updated_at=datetime('now') WHERE id=?").run(id)
      })()
    } else {
      // No Emergency bank account set up yet: keep the old stand-alone behaviour.
      const next = Math.max(0, (Number(fund.current_amount) || 0) + amt)
      db.prepare(`UPDATE emergency_fund SET current_amount=?, updated_at=datetime('now') WHERE id=?`).run(next, id)
    }
    return loadFund()
  })
}
