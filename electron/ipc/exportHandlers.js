const { ipcMain, dialog, shell } = require('electron')
const { getDb } = require('../database')
const XLSX = require('xlsx')
const path = require('path')
const os = require('os')

module.exports = function registerExportHandlers() {
  const db = getDb()

  ipcMain.handle('export:excel', async (event) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export to Excel',
      defaultPath: path.join(os.homedir(), `finance-tracker-${new Date().toISOString().split('T')[0]}.xlsx`),
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    })
    if (!filePath) return { cancelled: true }

    const wb = XLSX.utils.book_new()
    const sum1 = (sql, ...p) => db.prepare(sql).get(...p)?.t || 0
    // Append a TOTAL row (summing the given numeric columns) so each sheet self-tallies.
    const sheetWithTotal = (rows, totalCols) => {
      const data = rows.slice()
      if (rows.length) {
        const total = { [Object.keys(rows[0])[0]]: 'TOTAL' }
        for (const c of totalCols) total[c] = rows.reduce((s, r) => s + (Number(r[c]) || 0), 0)
        data.push(total)
      }
      return XLSX.utils.json_to_sheet(data)
    }

    // ---- Summary sheet (totals of every section, to tally automatically) ----
    const income = sum1('SELECT COALESCE(SUM(total_salary),0) t FROM salary_allocations')
    const expTotal = sum1('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE deleted_at IS NULL')
    const recurringSpent = sum1("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE category='NEED' AND deleted_at IS NULL")
    const personalSpent = sum1("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE category='WANT' AND deleted_at IS NULL")
    const invested = sum1("SELECT COALESCE(SUM(invested_amount),0) t FROM investments WHERE status='ACTIVE'")
    // Fall back to invested when no current value is recorded, matching the Dashboard/Investments math.
    const portfolio = sum1("SELECT COALESCE(SUM(COALESCE(current_value,invested_amount)),0) t FROM investments WHERE status='ACTIVE'")
    const savAlloc = sum1('SELECT COALESCE(SUM(savings_amount),0) t FROM salary_allocations')
    const savManual = sum1('SELECT COALESCE(SUM(amount),0) t FROM savings_ledger')
    const savAchieved = sum1('SELECT COALESCE(SUM(target_amount),0) t FROM savings WHERE achieved=1')
    const bankTotal = sum1('SELECT COALESCE(SUM(balance),0) t FROM bank_accounts')
    const emergencyBank = sum1("SELECT COALESCE(SUM(balance),0) t FROM bank_accounts WHERE purpose='EMERGENCY'")
    const billsTotal = sum1('SELECT COALESCE(SUM(amount),0) t FROM bills')
    // Netted per person (GPay-style), matching the Lending & Debts page.
    const loanRows = db.prepare("SELECT person, kind, amount FROM loans WHERE settled=0").all()
    const perPerson = {}
    for (const l of loanRows) {
      const k = (l.person || '').trim().toLowerCase()
      perPerson[k] = (perPerson[k] || 0) + (l.kind === 'LEND' ? 1 : -1) * (Number(l.amount) || 0)
    }
    let toReceive = 0, toRepay = 0
    for (const k in perPerson) { const n = perPerson[k]; if (n > 0) toReceive += n; else toRepay += -n }
    const recurringMonthly = sum1('SELECT COALESCE(SUM(amount),0) t FROM recurring_expenses WHERE active=1')
    const cardOut = sum1("SELECT COALESCE(SUM(CASE WHEN type='PAYMENT' THEN -amount ELSE amount END),0) t FROM card_transactions")
    const summary = [
      { Metric: 'Total Income (salary)', Amount: income },
      { Metric: 'Total Expenses', Amount: expTotal },
      { Metric: '  - Recurring spent', Amount: recurringSpent },
      { Metric: '  - Personal spent', Amount: personalSpent },
      { Metric: 'Total Invested', Amount: invested },
      { Metric: 'Portfolio Current Value', Amount: portfolio },
      { Metric: 'Unrealised P&L', Amount: portfolio - invested },
      { Metric: 'Savings Available', Amount: savAlloc + savManual - savAchieved },
      { Metric: 'Emergency (accounts)', Amount: emergencyBank },
      { Metric: 'Bank Balance (total)', Amount: bankTotal },
      { Metric: 'Bills (total)', Amount: billsTotal },
      { Metric: 'Money to Receive', Amount: toReceive },
      { Metric: 'Money to Repay', Amount: toRepay },
      { Metric: 'Credit Card Outstanding', Amount: cardOut },
      { Metric: 'Recurring Expenses / month', Amount: recurringMonthly },
      { Metric: 'Net Worth (est.)', Amount: bankTotal + portfolio + toReceive - toRepay - cardOut },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')

    // Expenses sheet
    const expenses = db.prepare('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC').all()
    const expSheet = sheetWithTotal(expenses.map(e => ({
      ID: e.id, Title: e.title, Amount: e.amount,
      Type: e.category === 'NEED' ? 'Recurring' : e.category === 'WANT' ? 'Personal' : e.category, Category: e.category_name || '',
      Date: e.date, 'Payment Method': e.payment_method || '', Notes: e.notes || ''
    })), ['Amount'])
    XLSX.utils.book_append_sheet(wb, expSheet, 'Expenses')

    // Savings sheet
    const savings = db.prepare('SELECT * FROM savings').all()
    const savSheet = sheetWithTotal(savings.map(s => ({
      ID: s.id, Title: s.title, 'Target Amount': s.target_amount,
      'Current Amount': s.current_amount,
      'Progress %': s.target_amount > 0 ? ((s.current_amount / s.target_amount) * 100).toFixed(1) : 0,
      'Monthly Contribution': s.monthly_contribution,
      Deadline: s.deadline || '', Status: s.status, Notes: s.notes || ''
    })), ['Target Amount', 'Current Amount'])
    XLSX.utils.book_append_sheet(wb, savSheet, 'Savings')

    // Investments sheet
    const investments = db.prepare('SELECT * FROM investments').all()
    const invSheet = sheetWithTotal(investments.map(i => {
      const cv = i.current_value || i.invested_amount
      const gl = cv - i.invested_amount
      return {
        ID: i.id, Title: i.title, Type: i.type,
        'Invested Amount': i.invested_amount, 'Current Value': cv,
        'Gain/Loss': gl.toFixed(2),
        'Gain/Loss %': i.invested_amount > 0 ? ((gl / i.invested_amount) * 100).toFixed(2) : 0,
        Units: i.units || '', 'Buy Price': i.purchase_price || '', 'Current Price': i.current_price || '',
        'Interest/Expected Return %': i.interest_rate || '',
        'Monthly SIP': i.sip_amount || '', 'SIP Start': i.type === 'SIP' ? i.date : '', 'SIP End': i.sip_end || '',
        Platform: i.platform || '', Date: i.date, Status: i.status
      }
    }), ['Invested Amount', 'Current Value'])
    XLSX.utils.book_append_sheet(wb, invSheet, 'Investments')

    // Salary sheet
    const salaries = db.prepare('SELECT * FROM salary_allocations ORDER BY year DESC, month DESC').all()
    const salSheet = sheetWithTotal(salaries.map(s => ({
      Month: s.month, Year: s.year, 'Total Salary': s.total_salary,
      'Recurring %': s.needs_percentage, 'Recurring Amount': s.needs_amount,
      'Personal %': s.wants_percentage, 'Personal Amount': s.wants_amount,
      'Investment %': s.investment_percentage || 0, 'Investment Amount': s.investment_amount || 0,
      'Savings %': s.savings_percentage, 'Savings Amount': s.savings_amount,
    })), ['Total Salary', 'Recurring Amount', 'Personal Amount', 'Investment Amount', 'Savings Amount'])
    XLSX.utils.book_append_sheet(wb, salSheet, 'Salary Allocations')

    // Bank accounts
    const banks = db.prepare('SELECT * FROM bank_accounts').all()
    XLSX.utils.book_append_sheet(wb, sheetWithTotal(banks.map(b => ({
      ID: b.id, Name: b.name, Bank: b.bank || '', 'A/c': b.account_number || '',
      Balance: b.balance, 'Used for': b.purpose, Notes: b.notes || ''
    })), ['Balance']), 'Bank Accounts')

    // Bills
    const bills = db.prepare('SELECT * FROM bills ORDER BY date DESC').all()
    XLSX.utils.book_append_sheet(wb, sheetWithTotal(bills.map(b => ({
      ID: b.id, Title: b.title, Type: b.type, Amount: b.amount, Date: b.date, Notes: b.notes || ''
    })), ['Amount']), 'Bills')

    // Recurring expenses
    const recurring = db.prepare('SELECT * FROM recurring_expenses').all()
    XLSX.utils.book_append_sheet(wb, sheetWithTotal(recurring.map(r => ({
      ID: r.id, Name: r.title, Category: r.category, 'Amount / month': r.amount,
      'Due day': r.due_day || '', Active: r.active ? 'Yes' : 'No', Notes: r.notes || ''
    })), ['Amount / month']), 'Recurring Expenses')

    // Lending & Debts
    const loans = db.prepare('SELECT * FROM loans ORDER BY kind, date DESC').all()
    XLSX.utils.book_append_sheet(wb, sheetWithTotal(loans.map(l => ({
      ID: l.id, Kind: l.kind === 'LEND' ? 'Lent (to receive)' : 'Borrowed (to repay)', Person: l.person,
      Amount: l.amount, Date: l.date, 'Return by': l.return_date || '', Reason: l.reason || '',
      Settled: l.settled ? 'Yes' : 'No'
    })), ['Amount']), 'Lending & Debts')

    // Credit cards (outstanding kept separate from expenses/budget)
    const cards = db.prepare('SELECT * FROM credit_cards').all()
    XLSX.utils.book_append_sheet(wb, sheetWithTotal(cards.map(c => {
      const outstanding = db.prepare("SELECT COALESCE(SUM(CASE WHEN type='PAYMENT' THEN -amount ELSE amount END),0) o FROM card_transactions WHERE card_id=?").get(c.id).o || 0
      return {
        ID: c.id, Name: c.name, Bank: c.bank || '', 'Last 4': c.last4 || '',
        'Credit Limit': c.credit_limit || 0, Outstanding: outstanding, Available: (c.credit_limit || 0) - outstanding,
        'Billing day': c.billing_day || '', 'Due day': c.due_day || '', Notes: c.notes || '',
      }
    }), ['Credit Limit', 'Outstanding', 'Available']), 'Credit Cards')

    // Credit-card transactions (spends & payments)
    const cardTx = db.prepare('SELECT ct.*, cc.name AS card FROM card_transactions ct LEFT JOIN credit_cards cc ON cc.id=ct.card_id ORDER BY ct.date DESC').all()
    XLSX.utils.book_append_sheet(wb, sheetWithTotal(cardTx.map(t => ({
      ID: t.id, Card: t.card || '', Title: t.title || '', Type: t.type, Amount: t.amount,
      Category: t.category || '', Date: t.date, Notes: t.notes || '',
    })), ['Amount']), 'Card Transactions')

    XLSX.writeFile(wb, filePath)
    shell.showItemInFolder(filePath)
    return { success: true, filePath }
  })

  ipcMain.handle('export:getDbPath', () => {
    const { app } = require('electron')
    return path.join(app.getPath('userData'), 'finance.db')
  })

  ipcMain.handle('export:openDbFolder', () => {
    const { app } = require('electron')
    shell.openPath(app.getPath('userData'))
    return { success: true }
  })
}
