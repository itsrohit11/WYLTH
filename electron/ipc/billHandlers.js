const { ipcMain } = require('electron')
const { getDb } = require('../database')

// Bills are tracked on their own and are NOT included in any other totals/budgets.
module.exports = function registerBillHandlers() {
  const db = getDb()

  ipcMain.handle('bill:getAll', () => db.prepare('SELECT * FROM bills ORDER BY COALESCE(sort_order, 999999), date DESC').all())

  ipcMain.handle('bill:typeTotals', () =>
    db.prepare(`SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM bills GROUP BY type ORDER BY total DESC`).all())

  ipcMain.handle('bill:create', (_, d) => {
    const r = db.prepare(`
      INSERT INTO bills (title, type, amount, date, notes, monthly, due_day)
      VALUES (@title, @type, @amount, @date, @notes, @monthly, @due_day)
    `).run({
      title: d.title, type: d.type || 'OTHER', amount: Number(d.amount) || 0,
      date: d.date, notes: d.notes || null,
      monthly: d.monthly ? 1 : 0, due_day: d.due_day ? Number(d.due_day) : null,
    })
    return db.prepare('SELECT * FROM bills WHERE id=?').get(r.lastInsertRowid)
  })

  ipcMain.handle('bill:update', (_, { id, data }) => {
    db.prepare(`
      UPDATE bills SET title=@title, type=@type, amount=@amount, date=@date, notes=@notes,
        monthly=@monthly, due_day=@due_day, updated_at=datetime('now')
      WHERE id=@id
    `).run({
      title: data.title, type: data.type || 'OTHER', amount: Number(data.amount) || 0,
      date: data.date, notes: data.notes || null,
      monthly: data.monthly ? 1 : 0, due_day: data.due_day ? Number(data.due_day) : null, id,
    })
    return db.prepare('SELECT * FROM bills WHERE id=?').get(id)
  })

  ipcMain.handle('bill:delete', (_, id) => { db.prepare('DELETE FROM bills WHERE id=?').run(id); return { success: true } })
}
