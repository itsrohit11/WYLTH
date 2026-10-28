const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn } = require('../lib/ledger')

// kind: 'LEND' (money I lent out, to receive) | 'DEBT' (money I borrowed, to repay)
module.exports = function registerLoanHandlers() {
  const db = getDb()

  ipcMain.handle('loan:getAll', (_, { kind } = {}) => {
    return kind
      ? db.prepare('SELECT * FROM loans WHERE kind=? ORDER BY settled ASC, COALESCE(sort_order, 999999), date DESC').all(kind)
      : db.prepare('SELECT * FROM loans ORDER BY settled ASC, COALESCE(sort_order, 999999), date DESC').all()
  })

  ipcMain.handle('loan:create', (_, d) => {
    const r = db.prepare(`
      INSERT INTO loans (kind, person, amount, date, return_date, reason, settled, notes)
      VALUES (@kind, @person, @amount, @date, @return_date, @reason, @settled, @notes)
    `).run({
      kind: d.kind, person: d.person, amount: Number(d.amount) || 0, date: d.date,
      return_date: d.return_date || null, reason: d.reason || null, settled: d.settled ? 1 : 0, notes: d.notes || null,
    })
    return db.prepare('SELECT * FROM loans WHERE id=?').get(r.lastInsertRowid)
  })

  ipcMain.handle('loan:update', (_, { id, data }) => {
    const existing = db.prepare('SELECT * FROM loans WHERE id=?').get(id)
    if (existing && existing.locked) return existing   // locked entries can't be changed
    db.prepare(`
      UPDATE loans SET kind=@kind, person=@person, amount=@amount, date=@date, return_date=@return_date,
        reason=@reason, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({
      kind: data.kind || existing?.kind || 'LEND',
      person: data.person, amount: Number(data.amount) || 0, date: data.date,
      return_date: data.return_date || null, reason: data.reason || null, notes: data.notes || null, id,
    })
    return db.prepare('SELECT * FROM loans WHERE id=?').get(id)
  })

  // Settling can move real money: a settled LEND means the person paid you back (money IN
  // to the chosen account); a settled DEBT means you paid them (money OUT of the account).
  // The account id is stored so un-settling reverses the adjustment exactly.
  ipcMain.handle('loan:setSettled', (_, { id, settled, account_id }) => {
    const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(id)
    if (!loan) return null
    if (loan.locked) return loan   // locked entries can't be settled/un-settled
    const amt = Number(loan.amount) || 0
    if (settled && !loan.settled && account_id) {
      const delta = loan.kind === 'LEND' ? amt : -amt
      postBankTxn(db, account_id, delta, { source: 'LOAN', refType: 'loan', refId: id,
        note: loan.kind === 'LEND' ? `Repaid by ${loan.person}` : `Repaid to ${loan.person}` })
      db.prepare('UPDATE loans SET settle_account_id=? WHERE id=?').run(account_id, id)
    } else if (!settled && loan.settled && loan.settle_account_id) {
      const delta = loan.kind === 'LEND' ? -amt : amt
      postBankTxn(db, loan.settle_account_id, delta, { source: 'LOAN', refType: 'loan', refId: id,
        note: `Settlement undone (${loan.person})` })
      db.prepare('UPDATE loans SET settle_account_id=NULL WHERE id=?').run(id)
    }
    db.prepare(`UPDATE loans SET settled=?, updated_at=datetime('now') WHERE id=?`).run(settled ? 1 : 0, id)
    return db.prepare('SELECT * FROM loans WHERE id=?').get(id)
  })

  ipcMain.handle('loan:delete', (_, id) => {
    const loan = db.prepare('SELECT locked FROM loans WHERE id=?').get(id)
    if (loan && loan.locked) return { success: false, locked: true }
    db.prepare('DELETE FROM loans WHERE id=?').run(id)
    return { success: true }
  })

  // Remove every entry for one person. Locked entries are kept (unlock them first). Money that
  // already moved when something was settled stays on the bank statement as it was.
  ipcMain.handle('loan:deletePerson', (_, { person }) => {
    const key = String(person || '').trim().toLowerCase()
    if (!key) return { success: false, deleted: 0, locked: 0 }
    const rows = db.prepare('SELECT id, locked, person FROM loans').all().filter((r) => String(r.person || '').trim().toLowerCase() === key)
    let deleted = 0, locked = 0
    db.transaction(() => {
      for (const r of rows) {
        if (r.locked) { locked++; continue }
        db.prepare('DELETE FROM loans WHERE id=?').run(r.id); deleted++
      }
    })()
    return { success: true, deleted, locked }
  })

  // Lock / unlock an entry (locked = frozen, no edits/settle/delete until unlocked).
  ipcMain.handle('loan:setLocked', (_, { id, locked }) => {
    db.prepare(`UPDATE loans SET locked=?, updated_at=datetime('now') WHERE id=?`).run(locked ? 1 : 0, id)
    return db.prepare('SELECT * FROM loans WHERE id=?').get(id)
  })
}
