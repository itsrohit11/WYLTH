const { ipcMain } = require('electron')
const { getDb } = require('../database')

const ALLOWED = ['investments', 'bank_accounts', 'bills', 'loans', 'recurring_expenses', 'credit_cards']

// Persist a new manual order for a list. `ids` is the full list of row ids in the
// desired order; sort_order is set to the index of each.
module.exports = function registerReorderHandlers() {
  const db = getDb()
  ipcMain.handle('reorder:set', (_, { table, ids }) => {
    if (!ALLOWED.includes(table) || !Array.isArray(ids)) return { ok: false }
    const stmt = db.prepare(`UPDATE ${table} SET sort_order=? WHERE id=?`)
    const tx = db.transaction((list) => { list.forEach((id, i) => stmt.run(i, id)) })
    tx(ids)
    return { ok: true }
  })
}
