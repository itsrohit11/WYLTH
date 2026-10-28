const { ipcMain } = require('electron')
const { getDb } = require('../database')

// Normalize an allocation regardless of whether the user entered it by amount (₹) or by
// percentage. For each bucket we take the explicit *_amount if it was sent, otherwise we
// derive it from the percentage. Savings is always the leftover, and every percentage is
// recomputed from the final amounts and rounded to 1 decimal place.
function deriveBuckets(data) {
  const total = Number(data.total_salary) || 0
  const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10
  const amtOf = (amtKey, pctKey) => {
    const a = data[amtKey]
    if (a !== undefined && a !== null && a !== '') return Number(a) || 0
    return total * (Number(data[pctKey]) || 0) / 100
  }
  const needs = amtOf('needs_amount', 'needs_percentage')
  const wants = amtOf('wants_amount', 'wants_percentage')
  const invest = amtOf('investment_amount', 'investment_percentage')
  const savings = total - needs - wants - invest
  const pct = (a) => (total > 0 ? round1((a / total) * 100) : 0)
  return {
    needs_amount: needs, wants_amount: wants, investment_amount: invest, savings_amount: savings,
    needs_percentage: pct(needs), wants_percentage: pct(wants),
    investment_percentage: pct(invest), savings_percentage: pct(savings),
  }
}

function enrichWithSpending(row) {
  const db = getDb()
  const yr = String(row.year)
  const mo = String(row.month).padStart(2, '0')
  const needsSpent = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND category='NEED' AND deleted_at IS NULL`
  ).get(mo, yr)?.total || 0
  const wantsSpent = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND category='WANT' AND deleted_at IS NULL`
  ).get(mo, yr)?.total || 0
  return {
    ...row,
    totalNeedsSpent: needsSpent,
    totalWantsSpent: wantsSpent,
    remainingNeeds: (row.needs_amount || 0) - needsSpent,
    remainingWants: (row.wants_amount || 0) - wantsSpent,
  }
}

module.exports = function registerSalaryHandlers() {
  const db = getDb()

  ipcMain.handle('salary:getAll', () => {
    const rows = db.prepare('SELECT * FROM salary_allocations ORDER BY year DESC, month DESC').all()
    return rows.map(enrichWithSpending)
  })

  ipcMain.handle('salary:getCurrent', () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const row = db.prepare('SELECT * FROM salary_allocations WHERE month=? AND year=?').get(month, year)
      || db.prepare('SELECT * FROM salary_allocations ORDER BY year DESC, month DESC LIMIT 1').get()
    return row ? enrichWithSpending(row) : null
  })

  ipcMain.handle('salary:create', (_, data) => {
    const b = deriveBuckets(data)
    const stmt = db.prepare(`
      INSERT INTO salary_allocations (month, year, total_salary, needs_percentage, wants_percentage, savings_percentage, investment_percentage,
        needs_amount, wants_amount, savings_amount, investment_amount, notes)
      VALUES (@month, @year, @total_salary, @needs_percentage, @wants_percentage, @savings_percentage, @investment_percentage,
        @needs_amount, @wants_amount, @savings_amount, @investment_amount, @notes)
    `)
    const result = stmt.run({
      month: data.month, year: data.year, total_salary: Number(data.total_salary) || 0,
      notes: data.notes || null, ...b,
    })
    const row = db.prepare('SELECT * FROM salary_allocations WHERE id=?').get(result.lastInsertRowid)
    return enrichWithSpending(row)
  })

  ipcMain.handle('salary:update', (_, { id, data }) => {
    const b = deriveBuckets(data)
    db.prepare(`
      UPDATE salary_allocations SET month=@month, year=@year, total_salary=@total_salary,
        needs_percentage=@needs_percentage, wants_percentage=@wants_percentage, savings_percentage=@savings_percentage, investment_percentage=@investment_percentage,
        needs_amount=@needs_amount, wants_amount=@wants_amount, savings_amount=@savings_amount, investment_amount=@investment_amount,
        notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({
      month: data.month, year: data.year, total_salary: Number(data.total_salary) || 0,
      notes: data.notes || null, ...b, id,
    })
    const row = db.prepare('SELECT * FROM salary_allocations WHERE id=?').get(id)
    return enrichWithSpending(row)
  })

  ipcMain.handle('salary:delete', (_, id) => {
    db.prepare('DELETE FROM salary_allocations WHERE id=?').run(id)
    return { success: true }
  })
}
