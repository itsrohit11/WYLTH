const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn, localToday } = require('../lib/ledger')

function enrichSaving(row) {
  const progress = row.target_amount > 0
    ? ((row.current_amount / row.target_amount) * 100).toFixed(2)
    : 0
  const remaining = row.target_amount - row.current_amount
  const months = row.monthly_contribution > 0 && remaining > 0
    ? Math.ceil(remaining / row.monthly_contribution)
    : null
  return { ...row, progressPercentage: parseFloat(progress), remainingAmount: remaining, estimatedMonthsToComplete: months }
}

module.exports = function registerSavingHandlers() {
  const db = getDb()

  // Savings money lives in your SAVINGS bank account(s) — one shared number. The Savings tab
  // and the Bank tab read/write the same balance, so they always match.
  const primarySavingsAccount = () =>
    db.prepare("SELECT id FROM bank_accounts WHERE purpose='SAVINGS' ORDER BY COALESCE(sort_order,999999), created_at DESC LIMIT 1").get()?.id || null
  const savingsBankTotal = () =>
    db.prepare("SELECT COALESCE(SUM(balance),0) t FROM bank_accounts WHERE purpose='SAVINGS'").get().t || 0
  const adjustAccount = (accId, delta, note, opts = {}) =>
    postBankTxn(db, accId, delta, { source: 'SAVINGS', note, ...opts })

  ipcMain.handle('saving:getAll', () => {
    return db.prepare('SELECT * FROM savings ORDER BY created_at DESC').all().map(enrichSaving)
  })

  // Savings balance = your SAVINGS bank account total + any broker cash you haven't invested
  // yet (money sitting in the demat account is still your savings until you actually buy).
  ipcMain.handle('saving:getBalance', () => {
    const bankSavings = savingsBankTotal()
    const dematCash = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM demat_funds WHERE invested=0 AND deleted_at IS NULL').get().t || 0
    const accId = primarySavingsAccount()
    const account = accId ? db.prepare('SELECT id, name, bank, balance FROM bank_accounts WHERE id=?').get(accId) : null
    // Money already earmarked for goals that are still being saved towards.
    const allocated = db.prepare("SELECT COALESCE(SUM(current_amount),0) t FROM savings WHERE COALESCE(achieved,0)=0 AND status<>'COMPLETED'").get().t || 0
    const available = bankSavings + dematCash
    return { available, bankSavings, dematCash, allocated, free: available - allocated, account, hasAccount: accId != null }
  })

  // Marking a goal purchased spends its target from the savings account; undo gives it back.
  ipcMain.handle('saving:setAchieved', (_, { id, achieved }) => {
    const row = db.prepare('SELECT title, achieved, target_amount FROM savings WHERE id=?').get(id)
    if (!row) return null
    const was = !!row.achieved, now = !!achieved
    db.prepare(`UPDATE savings SET achieved=?, achieved_date=?, updated_at=datetime('now') WHERE id=?`)
      .run(now ? 1 : 0, now ? localToday() : null, id)
    const accId = primarySavingsAccount()
    if (accId) {
      if (now && !was) adjustAccount(accId, -(Number(row.target_amount) || 0), `Goal purchased: ${row.title}`, { refType: 'saving', refId: id })
      else if (!now && was) adjustAccount(accId, Number(row.target_amount) || 0, `Goal purchase undone: ${row.title}`, { refType: 'saving', refId: id })
    }
    return enrichSaving(db.prepare('SELECT * FROM savings WHERE id=?').get(id))
  })

  // Add / withdraw money — credits or debits the SAVINGS bank account (amount may be negative).
  ipcMain.handle('saving:getLedger', () => db.prepare('SELECT * FROM savings_ledger ORDER BY date DESC, id DESC').all())
  ipcMain.handle('saving:addMoney', (_, { amount, note, date }) => {
    const accId = primarySavingsAccount()
    const amt = parseFloat(amount) || 0
    if (!accId) throw new Error('Add a bank account with the purpose "Savings" in the Bank tab first. Savings lives in that account.')
    if (amt < 0) {
      const bal = db.prepare('SELECT name, balance FROM bank_accounts WHERE id=?').get(accId)
      if ((Number(bal.balance) || 0) + amt < 0) throw new Error(`Only ${Number(bal.balance).toLocaleString('en-IN')} is available in ${bal.name}`)
    }
    adjustAccount(accId, amt, note || (amt < 0 ? 'Withdrawn from savings' : 'Added to savings'), { date: date || null })
    return { success: true, hasAccount: true }
  })
  ipcMain.handle('saving:deleteMoney', (_, id) => { db.prepare('DELETE FROM savings_ledger WHERE id=?').run(id); return { success: true } })

  ipcMain.handle('saving:create', (_, data) => {
    const result = db.prepare(`
      INSERT INTO savings (title, description, target_amount, current_amount, monthly_contribution, deadline, status, notes)
      VALUES (@title, @description, @target_amount, @current_amount, @monthly_contribution, @deadline, @status, @notes)
    `).run({
      title: data.title, description: data.description || null,
      target_amount: data.target_amount, current_amount: data.current_amount || 0,
      monthly_contribution: data.monthly_contribution || 0,
      deadline: data.deadline || null, status: data.status || 'ACTIVE', notes: data.notes || null,
    })
    return enrichSaving(db.prepare('SELECT * FROM savings WHERE id=?').get(result.lastInsertRowid))
  })

  ipcMain.handle('saving:update', (_, { id, data }) => {
    db.prepare(`
      UPDATE savings SET title=@title, description=@description, target_amount=@target_amount,
        current_amount=@current_amount, monthly_contribution=@monthly_contribution,
        deadline=@deadline, status=@status, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...data, id })
    return enrichSaving(db.prepare('SELECT * FROM savings WHERE id=?').get(id))
  })

  ipcMain.handle('saving:addTransaction', (_, { id, amount, type, date, notes }) => {
    const saving = db.prepare('SELECT * FROM savings WHERE id=?').get(id)
    if (!saving) throw new Error('Saving not found')
    // Goal money is set aside INSIDE your savings account, so you can only set aside what is
    // not already earmarked for other goals. (Keeps goals and the account balance consistent.)
    if (type === 'DEPOSIT') {
      const bankSavings = savingsBankTotal()
      const dematCash = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM demat_funds WHERE invested=0 AND deleted_at IS NULL').get().t || 0
      const allocated = db.prepare("SELECT COALESCE(SUM(current_amount),0) t FROM savings WHERE COALESCE(achieved,0)=0 AND status<>'COMPLETED'").get().t || 0
      const free = bankSavings + dematCash - allocated
      if (parseFloat(amount) > free + 0.005) throw new Error(`Only ${Math.max(0, free).toLocaleString('en-IN')} of your savings is free to set aside. Add money to your savings first.`)
    }
    db.prepare(`
      INSERT INTO saving_transactions (saving_id, amount, type, date, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, amount, type, date || localToday(), notes || null)
    const newAmount = type === 'DEPOSIT'
      ? saving.current_amount + parseFloat(amount)
      : saving.current_amount - parseFloat(amount)
    const newStatus = newAmount >= saving.target_amount ? 'COMPLETED' : saving.status
    db.prepare(`UPDATE savings SET current_amount=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(newAmount, newStatus, id)
    return enrichSaving(db.prepare('SELECT * FROM savings WHERE id=?').get(id))
  })

  ipcMain.handle('saving:delete', (_, id) => {
    db.prepare('DELETE FROM savings WHERE id=?').run(id)
    return { success: true }
  })
}
