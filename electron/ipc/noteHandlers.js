const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { localToday } = require('../lib/ledger')

// Money notes: type anything about your finances. Every note is stamped with the day it was
// created (note_date, editable) plus exact created / last-edited times.
module.exports = function registerNoteHandlers() {
  const db = getDb()

  ipcMain.handle('note:getAll', () =>
    db.prepare('SELECT * FROM notes ORDER BY pinned DESC, note_date DESC, id DESC').all())

  ipcMain.handle('note:create', (_, d) => {
    const r = db.prepare(`INSERT INTO notes (title, body, tag, pinned, note_date) VALUES (?,?,?,?,?)`)
      .run((d.title || '').trim() || null, d.body || '', d.tag || 'GENERAL', d.pinned ? 1 : 0, d.note_date || localToday())
    return db.prepare('SELECT * FROM notes WHERE id=?').get(r.lastInsertRowid)
  })

  ipcMain.handle('note:update', (_, { id, data }) => {
    db.prepare(`UPDATE notes SET title=?, body=?, tag=?, pinned=?, note_date=?, updated_at=datetime('now') WHERE id=?`)
      .run((data.title || '').trim() || null, data.body || '', data.tag || 'GENERAL', data.pinned ? 1 : 0, data.note_date || localToday(), id)
    return db.prepare('SELECT * FROM notes WHERE id=?').get(id)
  })

  ipcMain.handle('note:pin', (_, { id, pinned }) => {
    db.prepare("UPDATE notes SET pinned=?, updated_at=datetime('now') WHERE id=?").run(pinned ? 1 : 0, id)
    return db.prepare('SELECT * FROM notes WHERE id=?').get(id)
  })

  ipcMain.handle('note:delete', (_, id) => { db.prepare('DELETE FROM notes WHERE id=?').run(id); return { success: true } })
}
