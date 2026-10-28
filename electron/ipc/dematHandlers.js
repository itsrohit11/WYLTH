const { ipcMain } = require('electron')
const { getDb } = require('../database')
const { postBankTxn } = require('../lib/ledger')

// Demat / broker cash.
//
// Money you transfer to a broker has NOT been spent — it sits there as cash until you
// actually buy something. So:
//   invested = 0  ->  counts as SAVINGS (uninvested broker cash)
//   invested = 1  ->  leaves savings and becomes an INVESTMENT
// Marking invested therefore moves money between two buckets and leaves your net worth
// unchanged, which is exactly right. Every step is reversible.

// Total broker cash still sitting uninvested — this is the figure Savings and net worth add.
function uninvestedDemat(db) {
  return db.prepare('SELECT COALESCE(SUM(amount),0) t FROM demat_funds WHERE invested=0 AND deleted_at IS NULL').get().t || 0
}

module.exports = function registerDematHandlers() {
  const db = getDb()

  const adjustAccount = (accId, delta, note, fundId) =>
    postBankTxn(db, accId, delta, { source: 'DEMAT', note, refType: 'demat', refId: fundId })
  const row = (id) => db.prepare('SELECT * FROM demat_funds WHERE id=?').get(id)

  ipcMain.handle('demat:getAll', () =>
    db.prepare('SELECT * FROM demat_funds WHERE deleted_at IS NULL ORDER BY date DESC, id DESC').all())

  ipcMain.handle('demat:summary', () => {
    const t = (sql) => db.prepare(sql).get().t || 0
    const uninvested = uninvestedDemat(db)
    const invested = t('SELECT COALESCE(SUM(amount),0) t FROM demat_funds WHERE invested=1 AND deleted_at IS NULL')
    return { uninvested, invested, total: uninvested + invested }
  })

  // Add money to the demat account. Optionally debit the bank account it came from — if that
  // is your SAVINGS account, your savings total stays the same (bank -X, broker cash +X),
  // which correctly reflects "moved my own money, spent nothing".
  ipcMain.handle('demat:add', (_, d) => {
    const add = db.transaction((data) => {
      const r = db.prepare(`
        INSERT INTO demat_funds (broker, amount, date, invested, source_account_id, notes)
        VALUES (@broker, @amount, @date, 0, @source_account_id, @notes)
      `).run({
        broker: data.broker || null,
        amount: Number(data.amount) || 0,
        date: data.date,
        source_account_id: data.source_account_id ? Number(data.source_account_id) : null,
        notes: data.notes || null,
      })
      if (data.source_account_id) adjustAccount(Number(data.source_account_id), -(Number(data.amount) || 0), `Transferred to demat${data.broker ? ` (${data.broker})` : ''}`, Number(r.lastInsertRowid))
      return r.lastInsertRowid
    })
    return row(add(d))
  })

  // Mark this broker cash as actually invested: it leaves savings and becomes an investment.
  // Either adds to an existing investment or creates a new one, and remembers which so the
  // action can be undone.
  ipcMain.handle('demat:markInvested', (_, { id, investment_id, newInvestment }) => {
    const mark = db.transaction(() => {
      const f = row(id)
      if (!f || f.invested || f.deleted_at) return
      const amount = Number(f.amount) || 0
      let invId = investment_id ? Number(investment_id) : null

      if (invId) {
        // Top up an existing holding.
        const inv = db.prepare('SELECT invested_amount, current_value FROM investments WHERE id=?').get(invId)
        if (!inv) return
        db.prepare(`UPDATE investments SET invested_amount=COALESCE(invested_amount,0)+?,
                    current_value=COALESCE(current_value,0)+?, updated_at=datetime('now') WHERE id=?`)
          .run(amount, amount, invId)
      } else {
        const n = newInvestment || {}
        const r = db.prepare(`
          INSERT INTO investments (title, type, invested_amount, current_value, platform, date, notes, status)
          VALUES (@title, @type, @invested_amount, @current_value, @platform, @date, @notes, 'ACTIVE')
        `).run({
          title: n.title || `${f.broker || 'Demat'} investment`,
          type: n.type || 'STOCKS',
          invested_amount: amount,
          current_value: amount,
          platform: n.platform || f.broker || null,
          date: n.date || f.date,
          notes: n.notes || null,
        })
        invId = Number(r.lastInsertRowid)
      }
      db.prepare("UPDATE demat_funds SET invested=1, investment_id=?, updated_at=datetime('now') WHERE id=?").run(invId, id)
    })
    mark()
    return row(id)
  })

  // Undo "invested" — the money goes back to being uninvested broker cash (i.e. savings).
  // Reverses the exact amount from the linked investment, removing it entirely if this
  // fund was all it held.
  ipcMain.handle('demat:unmarkInvested', (_, id) => {
    const unmark = db.transaction(() => {
      const f = row(id)
      if (!f || !f.invested) return
      const amount = Number(f.amount) || 0
      if (f.investment_id) {
        const inv = db.prepare('SELECT invested_amount FROM investments WHERE id=?').get(f.investment_id)
        if (inv) {
          const left = (Number(inv.invested_amount) || 0) - amount
          if (left <= 0.009) {
            // This fund was the whole holding — retire it rather than leaving a zero row.
            db.prepare("UPDATE investments SET status='CLOSED', invested_amount=0, current_value=0, updated_at=datetime('now') WHERE id=?").run(f.investment_id)
          } else {
            db.prepare(`UPDATE investments SET invested_amount=invested_amount-?,
                        current_value=MAX(COALESCE(current_value,0)-?,0), updated_at=datetime('now') WHERE id=?`)
              .run(amount, amount, f.investment_id)
          }
        }
      }
      db.prepare("UPDATE demat_funds SET invested=0, investment_id=NULL, updated_at=datetime('now') WHERE id=?").run(id)
    })
    unmark()
    return row(id)
  })

  ipcMain.handle('demat:update', (_, { id, data }) => {
    const upd = db.transaction(() => {
      const f = row(id)
      if (!f) return
      const newAmt = Number(data.amount) || 0
      const diff = newAmt - (Number(f.amount) || 0)
      db.prepare(`UPDATE demat_funds SET broker=@broker, amount=@amount, date=@date, notes=@notes,
                  updated_at=datetime('now') WHERE id=@id`)
        .run({ broker: data.broker || null, amount: newAmt, date: data.date, notes: data.notes || null, id })
      // Keep the source account and any linked investment consistent with the new amount.
      if (f.source_account_id && diff) adjustAccount(f.source_account_id, -diff, `Demat transfer edited${f.broker ? ` (${f.broker})` : ''}`, id)
      if (f.invested && f.investment_id && diff) {
        db.prepare(`UPDATE investments SET invested_amount=COALESCE(invested_amount,0)+?,
                    current_value=COALESCE(current_value,0)+?, updated_at=datetime('now') WHERE id=?`)
          .run(diff, diff, f.investment_id)
      }
    })
    upd()
    return row(id)
  })

  // Soft delete — refunds the source account and reverses any investment, but keeps the row
  // so it can be restored.
  ipcMain.handle('demat:delete', (_, id) => {
    const del = db.transaction(() => {
      const f = row(id)
      if (!f || f.deleted_at) return
      const amount = Number(f.amount) || 0
      if (f.invested && f.investment_id) {
        const inv = db.prepare('SELECT invested_amount FROM investments WHERE id=?').get(f.investment_id)
        if (inv) {
          const left = (Number(inv.invested_amount) || 0) - amount
          if (left <= 0.009) db.prepare("UPDATE investments SET status='CLOSED', invested_amount=0, current_value=0 WHERE id=?").run(f.investment_id)
          else db.prepare('UPDATE investments SET invested_amount=invested_amount-?, current_value=MAX(COALESCE(current_value,0)-?,0) WHERE id=?').run(amount, amount, f.investment_id)
        }
      }
      if (f.source_account_id) adjustAccount(f.source_account_id, amount, `Demat transfer removed (refund)${f.broker ? ` (${f.broker})` : ''}`, id) // give the money back
      db.prepare("UPDATE demat_funds SET deleted_at=datetime('now') WHERE id=?").run(id)
    })
    del()
    return { success: true }
  })

  ipcMain.handle('demat:restore', (_, id) => {
    const res = db.transaction(() => {
      const f = row(id)
      if (!f || !f.deleted_at) return
      // Comes back as uninvested cash; re-applies the source-account debit.
      if (f.source_account_id) adjustAccount(f.source_account_id, -(Number(f.amount) || 0), `Demat transfer restored${f.broker ? ` (${f.broker})` : ''}`, id)
      db.prepare("UPDATE demat_funds SET deleted_at=NULL, invested=0, investment_id=NULL WHERE id=?").run(id)
    })
    res()
    return row(id)
  })

  ipcMain.handle('demat:trashList', () =>
    db.prepare('SELECT * FROM demat_funds WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all())
}

module.exports.uninvestedDemat = uninvestedDemat
