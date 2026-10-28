const { ipcMain } = require('electron')
const { getDb } = require('../database')

// "Last updated" for each part of the app: the most recent time anything in that section was
// added, edited, deleted or restored. Timestamps are UTC 'YYYY-MM-DD HH:MM:SS' strings, which
// sort correctly as text, so MAX() works across tables.
const SECTIONS = {
  salary:        [['salary_allocations', ['updated_at', 'created_at']]],
  expenses:      [['expenses', ['updated_at', 'created_at', 'deleted_at']]],
  recurring:     [['bills', ['updated_at', 'created_at']], ['expenses', ['updated_at', 'created_at', 'deleted_at']]],
  cards:         [['credit_cards', ['updated_at', 'created_at']], ['card_transactions', ['created_at']]],
  savings:       [['savings', ['updated_at', 'created_at']], ['saving_transactions', ['created_at']],
                  ['savings_ledger', ['created_at']], ['demat_funds', ['updated_at', 'created_at', 'deleted_at']]],
  investments:   [['investments', ['updated_at', 'created_at']], ['stock_purchases', ['created_at']],
                  ['sip_nav', ['created_at']], ['investment_sales', ['updated_at', 'created_at']]],
  emergency:     [['emergency_fund', ['updated_at', 'created_at']]],
  bank:          [['bank_accounts', ['updated_at', 'created_at']], ['bank_transactions', ['created_at']]],
  loans:         [['loans', ['updated_at', 'created_at']]],
  notes:         [['notes', ['updated_at', 'created_at']]],
}

function maxOf(db, table, cols) {
  let best = null
  for (const c of cols) {
    try {
      const v = db.prepare(`SELECT MAX(${c}) m FROM ${table}`).get().m
      if (v && (!best || v > best)) best = v
    } catch { /* column missing on an old table — ignore */ }
  }
  return best
}

function lastUpdated(db) {
  const out = {}
  let overall = null
  for (const [name, parts] of Object.entries(SECTIONS)) {
    let best = null
    for (const [t, cols] of parts) { const v = maxOf(db, t, cols); if (v && (!best || v > best)) best = v }
    out[name] = best
    if (best && (!overall || best > overall)) overall = best
  }
  out.all = overall
  return out
}

module.exports = function registerMetaHandlers() {
  const db = getDb()
  ipcMain.handle('meta:lastUpdated', () => lastUpdated(db))
}
module.exports.lastUpdated = lastUpdated
