const { ipcMain } = require('electron')
const { getDb } = require('../database')

module.exports = function registerAnalyticsHandlers() {
  const db = getDb()

  ipcMain.handle('analytics:dashboard', () => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = String(now.getFullYear())

    const salary = db.prepare(
      'SELECT * FROM salary_allocations WHERE month=? AND year=? LIMIT 1'
    ).get(parseInt(month), parseInt(year))
      || db.prepare('SELECT * FROM salary_allocations ORDER BY year DESC, month DESC LIMIT 1').get()

    const needsSpent = db.prepare(
      `SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND category='NEED' AND deleted_at IS NULL`
    ).get(month, year)?.t || 0

    const wantsSpent = db.prepare(
      `SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND category='WANT' AND deleted_at IS NULL`
    ).get(month, year)?.t || 0

    // Savings totals
    const savTotals = db.prepare(
      `SELECT COALESCE(SUM(target_amount),0) as target, COALESCE(SUM(current_amount),0) as current FROM savings WHERE status='ACTIVE'`
    ).get()

    // Investments
    const invTotals = db.prepare(
      `SELECT COALESCE(SUM(invested_amount),0) as invested, COALESCE(SUM(COALESCE(current_value,invested_amount)),0) as current FROM investments WHERE status='ACTIVE'`
    ).get()

    // Emergency fund
    const ef = db.prepare('SELECT * FROM emergency_fund ORDER BY created_at DESC LIMIT 1').get()

    // Trend: last 6 months
    const trend = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const y = String(d.getFullYear())
      const total = db.prepare(
        `SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND deleted_at IS NULL`
      ).get(m, y)?.t || 0
      trend.push({ month: d.toLocaleString('default',{month:'short'}), year: d.getFullYear(), amount: total })
    }

    // By category this month
    const byCat = db.prepare(
      `SELECT COALESCE(category_name, category) as category, SUM(amount) as amount FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND deleted_at IS NULL GROUP BY COALESCE(category_name, category)`
    ).all(month, year)

    // Investment by type
    const invByType = db.prepare(
      `SELECT type, SUM(COALESCE(current_value,invested_amount)) as value FROM investments WHERE status='ACTIVE' GROUP BY type`
    ).all()

    // Recent expenses
    const recent = db.prepare('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC LIMIT 10').all()

    const totalInvested = invTotals?.invested || 0
    const totalCurrentVal = invTotals?.current || 0
    const gainLoss = totalCurrentVal - totalInvested

    return {
      currentSalary: salary?.total_salary || 0,
      needsBudget: salary?.needs_amount || 0,
      wantsBudget: salary?.wants_amount || 0,
      savingsBudget: salary?.savings_amount || 0,
      totalNeedsSpent: needsSpent,
      totalWantsSpent: wantsSpent,
      totalSpent: needsSpent + wantsSpent,
      remainingNeeds: (salary?.needs_amount || 0) - needsSpent,
      remainingWants: (salary?.wants_amount || 0) - wantsSpent,
      remainingBudget: (salary?.total_salary || 0) - needsSpent - wantsSpent,
      totalSavingsTarget: savTotals?.target || 0,
      totalSavingsCurrent: savTotals?.current || 0,
      savingsProgress: savTotals?.target > 0 ? ((savTotals.current / savTotals.target) * 100).toFixed(2) : 0,
      totalInvested,
      totalCurrentValue: totalCurrentVal,
      totalGainLoss: gainLoss,
      totalGainLossPercentage: totalInvested > 0 ? ((gainLoss / totalInvested) * 100).toFixed(2) : 0,
      emergencyFundTarget: ef?.target_amount || 0,
      emergencyFundCurrent: ef?.current_amount || 0,
      emergencyFundProgress: ef && ef.target_amount > 0 ? ((ef.current_amount / ef.target_amount) * 100).toFixed(2) : 0,
      monthlyExpensesTrend: trend,
      expensesByCategory: byCat,
      investmentAllocation: invByType,
      recentExpenses: recent,
    }
  })

  // Returns one summary row per month (Jan..Dec) for the given year.
  // Shape per item: { month, salary, needs, wants, total_expenses, savings_rate }
  ipcMain.handle('analytics:monthly', (_, { year } = {}) => {
    const yr = String(year || new Date().getFullYear())
    const yearNum = parseInt(yr, 10)
    const months = []

    for (let m = 1; m <= 12; m++) {
      const mo = String(m).padStart(2, '0')

      const salary = db.prepare(
        'SELECT total_salary FROM salary_allocations WHERE month=? AND year=?'
      ).get(m, yearNum)?.total_salary || 0

      const needs = db.prepare(
        `SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND category='NEED' AND deleted_at IS NULL`
      ).get(mo, yr)?.t || 0

      const wants = db.prepare(
        `SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND category='WANT' AND deleted_at IS NULL`
      ).get(mo, yr)?.t || 0

      const total_expenses = db.prepare(
        `SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m',date)=? AND strftime('%Y',date)=? AND deleted_at IS NULL`
      ).get(mo, yr)?.t || 0

      const savings_rate = salary > 0
        ? Number((((salary - total_expenses) / salary) * 100).toFixed(1))
        : 0

      months.push({ month: m, salary, needs, wants, total_expenses, savings_rate })
    }

    return months
  })
}
