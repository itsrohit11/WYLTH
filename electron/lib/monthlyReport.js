// Builds the month-wise Excel report: Overview, Expense, Banks & Cards, Investments.
// Pure function of the database — no Electron imports — so desktop and phone share it.
const ExcelJS = require('exceljs')
const { cashBalance } = require('./ledger')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n) => String(n).padStart(2, '0')

// ---- look & feel ---------------------------------------------------------------------------
const C = {
  navy: 'FF1B2540', brand: 'FF3F6FE0', brandSoft: 'FFE8EEFC', ink: 'FF1F2937', mute: 'FF6B7280',
  line: 'FFD9DFEA', zebra: 'FFF5F7FC', white: 'FFFFFFFF',
  green: 'FF16875B', greenSoft: 'FFE3F5EC', red: 'FFC73A46', redSoft: 'FFFCE8EA',
  amber: 'FF9A6700', amberSoft: 'FFFFF3D6', gold: 'FFC9A24B', violet: 'FF6D4AD6', violetSoft: 'FFEEE9FD',
  teal: 'FF0F8B8D', tealSoft: 'FFDFF3F3',
}
// Indian digit grouping (12,34,567) without needing a locale.
const INR = '[>=10000000]"₹"#\\,##\\,##\\,##0;[>=100000]"₹"#\\,##\\,##0;"₹"#,##0'
const PCT = '0.0%'
const FONT = 'Calibri'

const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin = (argb = C.line) => ({ style: 'thin', color: { argb } })
const boxBorder = { top: thin(), bottom: thin(), left: thin(), right: thin() }

function style(cell, o = {}) {
  cell.font = { name: FONT, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || C.ink } }
  if (o.fill) cell.fill = solid(o.fill)
  cell.alignment = { vertical: 'middle', horizontal: o.align || (o.num ? 'right' : 'left'), wrapText: !!o.wrap, indent: o.indent || 0 }
  if (o.border !== false) cell.border = boxBorder
  if (o.num) cell.numFmt = o.fmt || INR
  else if (o.fmt) cell.numFmt = o.fmt
}

function banner(ws, row, text, sub, lastCol) {
  ws.mergeCells(row, 1, row, lastCol)
  const c = ws.getCell(row, 1)
  c.value = text
  style(c, { bold: true, size: 18, color: C.white, fill: C.navy, border: false })
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(row).height = 36
  ws.mergeCells(row + 1, 1, row + 1, lastCol)
  const s = ws.getCell(row + 1, 1)
  s.value = sub
  style(s, { italic: true, size: 10, color: C.mute, fill: C.brandSoft, border: false })
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(row + 1).height = 20
}

function section(ws, row, c1, c2, text, color = C.brand) {
  ws.mergeCells(row, c1, row, c2)
  const c = ws.getCell(row, c1)
  c.value = text
  style(c, { bold: true, size: 12, color: C.white, fill: color, border: false })
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(row).height = 24
}

function headers(ws, row, col, labels, opts = {}) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, col + i)
    c.value = l
    const right = opts.right && opts.right.includes(i)
    style(c, { bold: true, color: C.navy, fill: opts.fill || 'FFDCE5F8', align: right ? 'right' : 'left', wrap: true })
  })
  ws.getRow(row).height = 22
}

function tile(ws, row, c1, c2, label, value, sub, color = C.brand, soft = C.brandSoft, fmt = INR) {
  for (const r of [row, row + 1, row + 2]) { if (c2 > c1) ws.mergeCells(r, c1, r, c2) }
  const l = ws.getCell(row, c1); l.value = label
  style(l, { size: 10, bold: true, color: C.mute, fill: soft, border: false }); l.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  const v = ws.getCell(row + 1, c1); v.value = value
  style(v, { size: 20, bold: true, color, fill: soft, border: false, fmt }); v.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  const s = ws.getCell(row + 2, c1); s.value = sub || ''
  style(s, { size: 9, color: C.mute, fill: soft, border: false }); s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  for (let c = c1; c <= c2; c++) for (const r of [row, row + 1, row + 2]) ws.getCell(r, c).fill = solid(soft)
  ws.getRow(row).height = 18; ws.getRow(row + 1).height = 32; ws.getRow(row + 2).height = 16
}

function cellText(ws, row, col, value, o = {}) {
  const c = ws.getCell(row, col)
  c.value = value
  style(c, o)
  if (!ws.getRow(row).height) ws.getRow(row).height = 19
  return c
}

const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

// ---- data helpers ---------------------------------------------------------------------------
const num = (v) => Number(v) || 0
const typeName = (c) => c === 'NEED' ? 'Recurring' : c === 'WANT' ? 'Personal' : (c || 'Other')
function catName(e) {
  let n = String(e.category_name || '').trim()
  if (!n) return 'Other'
  n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
  if (n === 'Groceries') n = 'Grocery'
  return n
}
const prevYm = (y, m) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 })
const ymOf = (y, m) => `${y}-${pad(m)}`
const fmtDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

function monthExpenses(db, ym) {
  return db.prepare("SELECT * FROM expenses WHERE deleted_at IS NULL AND substr(date,1,7)=? ORDER BY date, id").all(ym)
}
function sumByCat(rows) {
  const m = new Map()
  for (const e of rows) m.set(catName(e), (m.get(catName(e)) || 0) + num(e.amount))
  return m
}

// List of months a report can be made for: every month with data, up to and including this one.
function availableMonths(db) {
  const now = new Date(); const cur = ymOf(now.getFullYear(), now.getMonth() + 1)
  const set = new Set([cur])
  for (const r of db.prepare("SELECT DISTINCT substr(date,1,7) ym FROM expenses WHERE deleted_at IS NULL").all()) if (r.ym) set.add(r.ym)
  for (const r of db.prepare("SELECT year, month FROM salary_allocations").all()) set.add(ymOf(r.year, r.month))
  for (const r of db.prepare("SELECT DISTINCT substr(date,1,7) ym FROM investments").all()) if (r.ym) set.add(r.ym)
  return [...set].filter(x => /^\d{4}-\d{2}$/.test(x) && x <= cur).sort().reverse()
    .map(ym => { const [y, m] = ym.split('-').map(Number); return { ym, year: y, month: m, label: `${MONTHS[m - 1]} ${y}` } })
}

function fileNameFor(year, month) {
  const cur = new Date().getFullYear()
  return `WYLTH_${MONTHS[month - 1]}${year !== cur ? '_' + year : ''}.xlsx`
}

// ---- main ---------------------------------------------------------------------------------
async function buildMonthlyWorkbook(db, year, month) {
  const now = new Date()
  const ym = ymOf(year, month)
  if (ym > ymOf(now.getFullYear(), now.getMonth() + 1)) throw new Error('That month has not started yet')
  const label = `${MONTHS[month - 1]} ${year}`
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const isCurrent = ym === today.slice(0, 7)
  const daysInMonth = new Date(year, month, 0).getDate()
  const lastDay = isCurrent ? now.getDate() : daysInMonth

  const expenses = monthExpenses(db, ym)
  const p = prevYm(year, month)
  const prevExpenses = monthExpenses(db, ymOf(p.y, p.m))
  const spent = expenses.reduce((s, e) => s + num(e.amount), 0)
  const spentNeed = expenses.filter(e => e.category === 'NEED').reduce((s, e) => s + num(e.amount), 0)
  const spentWant = spent - spentNeed
  const prevSpent = prevExpenses.reduce((s, e) => s + num(e.amount), 0)
  const sal = db.prepare('SELECT * FROM salary_allocations WHERE year=? AND month=?').get(year, month)
  const salary = num(sal && sal.total_salary)
  const investedThisMonth = num(db.prepare("SELECT COALESCE(SUM(invested_amount),0) t FROM investments WHERE substr(date,1,7)=?").get(ym).t)
  const savedThisMonth = num(db.prepare("SELECT COALESCE(SUM(amount),0) t FROM savings_ledger WHERE amount>0 AND substr(date,1,7)=?").get(ym).t)

  // Money position (as of today)
  const banks = db.prepare('SELECT * FROM bank_accounts ORDER BY sort_order, id').all()
  const bankTotal = banks.reduce((s, b) => s + num(b.balance), 0)
  const cash = num(cashBalance(db))
  const invs = db.prepare("SELECT * FROM investments WHERE status='ACTIVE' ORDER BY type, sort_order, id").all()
  const invested = invs.reduce((s, i) => s + num(i.invested_amount), 0)
  const portfolio = invs.reduce((s, i) => s + num(i.current_value || i.invested_amount), 0)
  const cards = db.prepare('SELECT * FROM credit_cards ORDER BY sort_order, id').all()
  const cardOut = (id) => num(db.prepare("SELECT COALESCE(SUM(CASE WHEN type='PAYMENT' THEN -amount ELSE amount END),0) t FROM card_transactions WHERE card_id=?").get(id).t)
  const cardOutTotal = cards.reduce((s, c) => s + cardOut(c.id), 0)
  const loans = db.prepare('SELECT * FROM loans WHERE settled=0 ORDER BY date').all()
  const per = {}
  for (const l of loans) { const k = (l.person || '').trim().toLowerCase(); per[k] = (per[k] || 0) + (l.kind === 'LEND' ? 1 : -1) * num(l.amount) }
  let toReceive = 0, toRepay = 0
  for (const k in per) { if (per[k] > 0) toReceive += per[k]; else toRepay += -per[k] }
  const netWorth = bankTotal + cash + portfolio + toReceive - toRepay - cardOutTotal
  const emergency = db.prepare('SELECT * FROM emergency_fund LIMIT 1').get() || {}
  const savings = db.prepare('SELECT * FROM savings ORDER BY achieved, id').all()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'WYLTH'; wb.created = now
  wb.title = `WYLTH ${label}`
  const gen = `Prepared on ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}  ·  All amounts in ₹  ·  Balances, investments and debts are as of today`

  // ======================================== OVERVIEW ========================================
  {
    const ws = wb.addWorksheet('Overview', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.brand } } })
    ;[24, 16, 16, 16, 16, 16, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w })
    banner(ws, 1, `WYLTH  ·  ${label}  ·  Money overview`, gen, 8)

    const left = salary - spent
    tile(ws, 4, 1, 2, 'SALARY RECEIVED', salary, sal ? `${label}` : 'No salary added for this month', C.brand, C.brandSoft)
    tile(ws, 4, 3, 4, 'SPENT THIS MONTH', spent, prevSpent ? `${spent >= prevSpent ? '▲' : '▼'} ${Math.abs(((spent - prevSpent) / prevSpent) * 100).toFixed(1)}% vs ${MONTHS[p.m - 1]}` : 'No spending last month', spent > prevSpent ? C.red : C.green, spent > prevSpent ? C.redSoft : C.greenSoft)
    tile(ws, 4, 5, 6, 'LEFT FROM SALARY', left, salary ? `${Math.max(0, (left / salary) * 100).toFixed(0)}% of salary still unspent` : '', left >= 0 ? C.green : C.red, left >= 0 ? C.greenSoft : C.redSoft)
    tile(ws, 4, 7, 8, 'NET WORTH (TODAY)', netWorth, 'Everything you own minus what you owe', C.violet, C.violetSoft)

    // --- Salary allocation
    let r = 8
    section(ws, r, 1, 6, 'Salary allocation  ·  plan vs actual'); r++
    headers(ws, r, 1, ['Bucket', 'Plan %', 'Planned', 'Used', 'Left', 'Status'], { right: [1, 2, 3, 4] }); r++
    const buckets = [
      ['Recurring (needs)', sal && sal.needs_percentage, sal && sal.needs_amount, spentNeed, C.brand],
      ['Personal (wants)', sal && sal.wants_percentage, sal && sal.wants_amount, spentWant, C.amber],
      ['Investment', sal && sal.investment_percentage, sal && sal.investment_amount, investedThisMonth, C.teal],
      ['Savings', sal && sal.savings_percentage, sal && sal.savings_amount, savedThisMonth, C.green],
    ]
    const aStart = r
    for (const [name, pct, planned, used, color] of buckets) {
      const pl = num(planned)
      const over = pl > 0 && used > pl
      cellText(ws, r, 1, name, { bold: true, color })
      cellText(ws, r, 2, num(pct) / 100, { num: true, fmt: '0"%"' }).value = num(pct)
      cellText(ws, r, 3, pl, { num: true })
      cellText(ws, r, 4, used, { num: true, bold: true })
      cellText(ws, r, 5, pl - used, { num: true, color: pl - used < 0 ? C.red : C.green, bold: true })
      cellText(ws, r, 6, !pl ? '—' : over ? '⚠ Over plan' : '✔ Within plan', { bold: true, color: !pl ? C.mute : over ? C.red : C.green, fill: !pl ? C.white : over ? C.redSoft : C.greenSoft })
      r++
    }
    cellText(ws, r, 1, 'Total', { bold: true, fill: C.zebra })
    cellText(ws, r, 2, '', { fill: C.zebra })
    for (const [col, k] of [[3, 2], [4, 3]]) {
      const cc = ws.getCell(r, col)
      cc.value = { formula: `SUM(${colLetter(col)}${aStart}:${colLetter(col)}${r - 1})`, result: buckets.reduce((s, b) => s + num(b[k]), 0) }
      style(cc, { num: true, bold: true, fill: C.zebra })
    }
    const lc = ws.getCell(r, 5); lc.value = { formula: `C${r}-D${r}`, result: buckets.reduce((s, b) => s + num(b[2]) - num(b[3]), 0) }
    style(lc, { num: true, bold: true, fill: C.zebra })
    cellText(ws, r, 6, '', { fill: C.zebra })
    r += 2

    // --- Net worth
    section(ws, r, 1, 6, 'Net worth  ·  where your money is today', C.violet); r++
    headers(ws, r, 1, ['Item', 'Amount', 'Note'], { right: [1], fill: C.violetSoft }); ws.mergeCells(r, 3, r, 6); r++
    const nwStart = r
    const nw = [
      ['Bank balance', bankTotal, `${banks.length} account${banks.length === 1 ? '' : 's'}`, C.ink],
      ['Cash in hand', cash, '', C.ink],
      ['Investments (current value)', portfolio, `Invested ${fmtINR(invested)}`, C.ink],
      ['Money to receive', toReceive, 'Lent to others', C.green],
      ['Money to repay', -toRepay, 'Borrowed from others', C.red],
      ['Credit card dues', -cardOutTotal, `${cards.length} card${cards.length === 1 ? '' : 's'}`, C.red],
    ]
    for (const [name, amt, note, color] of nw) {
      cellText(ws, r, 1, name, { bold: true })
      cellText(ws, r, 2, amt, { num: true, color, bold: true })
      ws.mergeCells(r, 3, r, 6); cellText(ws, r, 3, note, { color: C.mute, italic: true })
      for (let c = 4; c <= 6; c++) ws.getCell(r, c).border = boxBorder
      r++
    }
    cellText(ws, r, 1, 'NET WORTH', { bold: true, color: C.white, fill: C.violet })
    const nwc = ws.getCell(r, 2); nwc.value = { formula: `SUM(B${nwStart}:B${r - 1})`, result: netWorth }
    style(nwc, { num: true, bold: true, color: C.white, fill: C.violet })
    ws.mergeCells(r, 3, r, 6); cellText(ws, r, 3, '', { fill: C.violet })
    r += 2

    // --- Investments
    section(ws, r, 1, 6, 'Investments  ·  summary', C.teal); r++
    headers(ws, r, 1, ['Invested', 'Current value', 'Gain / loss', 'Return %'], { right: [0, 1, 2, 3], fill: C.tealSoft }); r++
    const gain = portfolio - invested
    cellText(ws, r, 1, invested, { num: true, bold: true })
    cellText(ws, r, 2, portfolio, { num: true, bold: true })
    cellText(ws, r, 3, gain, { num: true, bold: true, color: gain >= 0 ? C.green : C.red, fill: gain >= 0 ? C.greenSoft : C.redSoft })
    cellText(ws, r, 4, invested ? gain / invested : 0, { num: true, fmt: PCT, bold: true, color: gain >= 0 ? C.green : C.red, fill: gain >= 0 ? C.greenSoft : C.redSoft })
    r += 2

    // --- Emergency fund
    section(ws, r, 1, 6, 'Emergency fund', C.amber); r++
    headers(ws, r, 1, ['Target', 'Saved', 'Funded', 'Months covered', 'Monthly add'], { right: [0, 1, 2, 3, 4], fill: C.amberSoft }); r++
    const eTarget = num(emergency.target_amount), eSaved = num(emergency.current_amount)
    cellText(ws, r, 1, eTarget, { num: true, bold: true })
    cellText(ws, r, 2, eSaved, { num: true, bold: true })
    const ef = cellText(ws, r, 3, eTarget ? Math.min(1, eSaved / eTarget) : 0, { num: true, fmt: PCT, bold: true })
    cellText(ws, r, 4, num(emergency.months_covered), { num: true, fmt: '0.0', bold: true })
    cellText(ws, r, 5, num(emergency.monthly_contribution), { num: true })
    ws.addConditionalFormatting({ ref: `C${r}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FFF2C94C' }, gradient: false }] })
    r += 2

    // --- Savings goals
    section(ws, r, 1, 6, 'Savings goals', C.green); r++
    headers(ws, r, 1, ['Goal', 'Target', 'Saved', 'Progress', 'Monthly add', 'Status'], { right: [1, 2, 3, 4], fill: C.greenSoft }); r++
    if (!savings.length) { ws.mergeCells(r, 1, r, 6); cellText(ws, r, 1, 'No savings goals yet', { color: C.mute, italic: true }); r++ }
    const sgStart = r
    for (const s of savings) {
      cellText(ws, r, 1, s.title, { bold: true })
      cellText(ws, r, 2, num(s.target_amount), { num: true })
      cellText(ws, r, 3, num(s.current_amount), { num: true, bold: true })
      cellText(ws, r, 4, num(s.target_amount) ? Math.min(1, num(s.current_amount) / num(s.target_amount)) : 0, { num: true, fmt: PCT })
      cellText(ws, r, 5, num(s.monthly_contribution), { num: true })
      cellText(ws, r, 6, s.achieved ? '✔ Achieved' : 'In progress', { bold: true, color: s.achieved ? C.green : C.brand, fill: s.achieved ? C.greenSoft : C.white })
      r++
    }
    if (savings.length) ws.addConditionalFormatting({ ref: `D${sgStart}:D${r - 1}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF7AD0A6' }, gradient: false }] })
    r++

    // --- Debts & lends
    section(ws, r, 1, 6, 'Debts & lends', C.red); r++
    headers(ws, r, 1, ['Person', 'Type', 'Amount', 'Date', 'Reason'], { right: [2], fill: C.redSoft }); ws.mergeCells(r, 5, r, 6); r++
    if (!loans.length) { ws.mergeCells(r, 1, r, 6); cellText(ws, r, 1, 'No open lends or debts', { color: C.mute, italic: true }); r++ }
    for (const l of loans) {
      const lend = l.kind === 'LEND'
      cellText(ws, r, 1, l.person, { bold: true })
      cellText(ws, r, 2, lend ? 'To receive' : 'To repay', { bold: true, color: lend ? C.green : C.red, fill: lend ? C.greenSoft : C.redSoft })
      cellText(ws, r, 3, num(l.amount), { num: true, bold: true, color: lend ? C.green : C.red })
      cellText(ws, r, 4, l.date ? fmtDate(l.date) : '', { fmt: 'dd mmm yyyy' })
      ws.mergeCells(r, 5, r, 6); cellText(ws, r, 5, l.reason || '', { color: C.mute })
      ws.getCell(r, 6).border = boxBorder
      r++
    }
    cellText(ws, r, 1, 'To receive / To repay', { bold: true, fill: C.zebra })
    cellText(ws, r, 2, '', { fill: C.zebra })
    cellText(ws, r, 3, toReceive - toRepay, { num: true, bold: true, fill: C.zebra, color: toReceive - toRepay >= 0 ? C.green : C.red })
    ws.mergeCells(r, 4, r, 6); cellText(ws, r, 4, `Receive ${fmtINR(toReceive)}  ·  Repay ${fmtINR(toRepay)}`, { fill: C.zebra, color: C.mute, italic: true })
  }

  // ======================================== EXPENSE =========================================
  {
    const ws = wb.addWorksheet('Expense', { views: [{ showGridLines: false, state: 'frozen', ySplit: 8 }], properties: { tabColor: { argb: C.red } } })
    ;[13, 30, 16, 11, 10, 13, 13, 3, 22, 14, 10, 14, 14, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w })
    banner(ws, 1, `WYLTH  ·  ${label}  ·  Expenses`, `${gen.replace('  ·  Balances, investments and debts are as of today', '')}  ·  ${expenses.length} entries`, 14)

    const remaining = salary - spent
    const avg = lastDay ? spent / lastDay : 0
    tile(ws, 4, 1, 2, 'SALARY RECEIVED', salary, '', C.brand, C.brandSoft)
    tile(ws, 4, 3, 4, 'SPENT TILL DATE', spent, `Avg ${fmtINR(avg)} per day`, C.red, C.redSoft)
    tile(ws, 4, 5, 6, 'REMAINING', remaining, salary ? `${Math.max(0, (remaining / salary) * 100).toFixed(0)}% of salary` : '', remaining >= 0 ? C.green : C.red, remaining >= 0 ? C.greenSoft : C.redSoft)
    tile(ws, 4, 7, 7, 'DAYS', lastDay, `of ${daysInMonth}`, C.mute, C.zebra, '0')
    tile(ws, 4, 9, 10, 'RECURRING SPENT', spentNeed, 'Rent, bills, groceries…', C.brand, C.brandSoft)
    tile(ws, 4, 11, 12, 'PERSONAL SPENT', spentWant, 'Food, travel, shopping…', C.amber, C.amberSoft)
    const chg = prevSpent ? (spent - prevSpent) / prevSpent : null
    tile(ws, 4, 13, 14, `VS ${MONTHS[p.m - 1].toUpperCase()}`, chg === null ? 'No data' : chg, chg === null ? '' : chg > 0 ? 'More than last month' : 'Less than last month', chg > 0 ? C.red : C.green, chg > 0 ? C.redSoft : C.greenSoft, '▲ 0.0%;▼ 0.0%;0.0%')

    section(ws, 7, 1, 7, `Daily expenses  ·  ${label}`)
    section(ws, 7, 9, 14, 'Spending by category  ·  vs last month')
    headers(ws, 8, 1, ['Date', 'Description', 'Category', 'Type', 'Paid by', 'Amount', 'Day total'], { right: [5, 6] })
    headers(ws, 8, 9, ['Category', 'Amount', '% of spend', `${MONTHS[p.m - 1]}`, 'Change ₹', 'Change %'], { right: [1, 2, 3, 4, 5] })

    // daily list
    const byDate = new Map()
    for (const e of expenses) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e) }
    let r = 9
    const first = r
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${ym}-${pad(d)}`
      if (key > today && isCurrent) break
      const items = byDate.get(key) || []
      const band = d % 2 === 0 ? C.zebra : C.white
      const dow = new Date(year, month - 1, d).toLocaleDateString('en-IN', { weekday: 'short' })
      if (!items.length) {
        cellText(ws, r, 1, fmtDate(key), { fmt: 'dd mmm, ddd', fill: band, color: C.mute })
        cellText(ws, r, 2, 'No spending', { fill: band, color: C.mute, italic: true })
        for (let c = 3; c <= 5; c++) cellText(ws, r, c, '', { fill: band })
        cellText(ws, r, 6, 0, { num: true, fill: band, color: C.mute })
        cellText(ws, r, 7, 0, { num: true, fill: band, color: C.mute })
        r++; continue
      }
      const dayStart = r
      items.forEach((e, i) => {
        cellText(ws, r, 1, i === 0 ? fmtDate(key) : '', { fmt: 'dd mmm, ddd', fill: band, bold: true })
        cellText(ws, r, 2, e.title, { fill: band })
        cellText(ws, r, 3, catName(e), { fill: band })
        const need = e.category === 'NEED'
        cellText(ws, r, 4, typeName(e.category), { fill: need ? C.brandSoft : C.amberSoft, color: need ? C.brand : C.amber, bold: true, align: 'center' })
        cellText(ws, r, 5, e.payment_method ? e.payment_method.charAt(0) + e.payment_method.slice(1).toLowerCase() : '', { fill: band, align: 'center' })
        cellText(ws, r, 6, num(e.amount), { num: true, fill: band })
        cellText(ws, r, 7, '', { fill: band })
        r++
      })
      const dt = ws.getCell(dayStart, 7)
      dt.value = { formula: `SUM(F${dayStart}:F${r - 1})`, result: items.reduce((s, e) => s + num(e.amount), 0) }
      style(dt, { num: true, bold: true, fill: C.amberSoft, color: C.ink })
    }
    const lastRow = r - 1
    cellText(ws, r, 1, 'TOTAL', { bold: true, color: C.white, fill: C.navy })
    for (let c = 2; c <= 5; c++) cellText(ws, r, c, '', { fill: C.navy })
    const tc = ws.getCell(r, 6); tc.value = { formula: `SUM(F${first}:F${lastRow})`, result: spent }
    style(tc, { num: true, bold: true, color: C.white, fill: C.navy })
    cellText(ws, r, 7, '', { fill: C.navy })

    // category table
    const cur = sumByCat(expenses), prev = sumByCat(prevExpenses)
    const names = [...new Set([...cur.keys(), ...prev.keys()])].sort((a, b) => (cur.get(b) || 0) - (cur.get(a) || 0))
    let cr = 9
    const cStart = cr
    for (const n of names) {
      const a = cur.get(n) || 0, b = prev.get(n) || 0
      const delta = a - b
      const pct = b ? delta / b : null
      cellText(ws, cr, 9, n, { bold: true })
      cellText(ws, cr, 10, a, { num: true, bold: true })
      cellText(ws, cr, 11, spent ? a / spent : 0, { num: true, fmt: PCT })
      cellText(ws, cr, 12, b, { num: true, color: C.mute })
      const up = delta > 0, flat = delta === 0
      cellText(ws, cr, 13, delta, { num: true, color: flat ? C.mute : up ? C.red : C.green, fmt: INR.replace(/"₹"/g, '"+₹"').split(';').map((s, i) => i < 3 ? s : s).join(';') })
      ws.getCell(cr, 13).numFmt = '+"₹"#,##0;-"₹"#,##0;"₹"0'
      const pc = cellText(ws, cr, 14, pct === null ? (a ? 'New' : '–') : pct, { num: true, bold: true, fmt: '▲ 0.0%;▼ 0.0%;0.0%', color: pct === null ? C.amber : flat ? C.mute : up ? C.red : C.green, fill: pct === null ? (a ? C.amberSoft : C.white) : flat ? C.white : up ? C.redSoft : C.greenSoft })
      pc.alignment = { horizontal: 'right', vertical: 'middle' }
      cr++
    }
    if (!names.length) { ws.mergeCells(cr, 9, cr, 14); cellText(ws, cr, 9, 'No expenses this month', { color: C.mute, italic: true }); cr++ }
    ws.addConditionalFormatting({ ref: `J${cStart}:J${cr - 1}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF8FB0F5' }, gradient: false }] })
    cellText(ws, cr, 9, 'TOTAL', { bold: true, color: C.white, fill: C.navy })
    const jt = ws.getCell(cr, 10); jt.value = { formula: `SUM(J${cStart}:J${cr - 1})`, result: spent }; style(jt, { num: true, bold: true, color: C.white, fill: C.navy })
    cellText(ws, cr, 11, 1, { num: true, fmt: PCT, bold: true, color: C.white, fill: C.navy })
    const lt = ws.getCell(cr, 12); lt.value = { formula: `SUM(L${cStart}:L${cr - 1})`, result: prevSpent }; style(lt, { num: true, bold: true, color: C.white, fill: C.navy })
    cellText(ws, cr, 13, spent - prevSpent, { num: true, bold: true, color: C.white, fill: C.navy }).numFmt = '+"₹"#,##0;-"₹"#,##0;"₹"0'
    cellText(ws, cr, 14, prevSpent ? (spent - prevSpent) / prevSpent : '–', { num: true, bold: true, color: C.white, fill: C.navy, fmt: '▲ 0.0%;▼ 0.0%;0.0%' })
    cr += 2

    // type + payment method split
    section(ws, cr, 9, 14, 'How it was paid', C.teal); cr++
    headers(ws, cr, 9, ['Payment method', 'Amount', '% of spend', 'Entries'], { right: [1, 2, 3], fill: C.tealSoft }); cr++
    const pm = new Map()
    for (const e of expenses) { const k = e.payment_method ? e.payment_method.charAt(0) + e.payment_method.slice(1).toLowerCase() : 'Other'; const o = pm.get(k) || { a: 0, n: 0 }; o.a += num(e.amount); o.n++; pm.set(k, o) }
    const pmStart = cr
    for (const [k, o] of [...pm.entries()].sort((a, b) => b[1].a - a[1].a)) {
      cellText(ws, cr, 9, k, { bold: true }); cellText(ws, cr, 10, o.a, { num: true }); cellText(ws, cr, 11, spent ? o.a / spent : 0, { num: true, fmt: PCT }); cellText(ws, cr, 12, o.n, { num: true, fmt: '0' }); cr++
    }
    if (pm.size) ws.addConditionalFormatting({ ref: `J${pmStart}:J${cr - 1}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF7FD0D2' }, gradient: false }] })
    cr++

    // recurring expenses (templates) + bills
    const paid = new Set(db.prepare('SELECT recurring_id FROM recurring_payments WHERE period=?').all(ym).map(x => x.recurring_id))
    const rec = db.prepare('SELECT * FROM recurring_expenses WHERE active=1 ORDER BY sort_order, due_day, id').all()
    const bills = db.prepare('SELECT * FROM bills ORDER BY sort_order, due_day, id').all()
    section(ws, cr, 9, 14, 'Recurring expenses  ·  every month', C.brand); cr++
    headers(ws, cr, 9, ['Name', 'Amount', 'Due day', 'Category', 'Status'], { right: [1, 2], fill: C.brandSoft }); ws.mergeCells(cr, 13, cr, 14); cr++
    if (!rec.length) { ws.mergeCells(cr, 9, cr, 14); cellText(ws, cr, 9, 'No recurring expenses set up', { color: C.mute, italic: true }); cr++ }
    const recStart = cr
    for (const x of rec) {
      cellText(ws, cr, 9, x.title, { bold: true }); cellText(ws, cr, 10, num(x.amount), { num: true }); cellText(ws, cr, 11, x.due_day || '', { num: true, fmt: '0', align: 'center' })
      cellText(ws, cr, 12, x.category || '', {}); ws.mergeCells(cr, 13, cr, 14)
      const ok = paid.has(x.id)
      cellText(ws, cr, 13, ok ? '✔ Paid' : isCurrent ? 'Pending' : '—', { bold: true, color: ok ? C.green : isCurrent ? C.amber : C.mute, fill: ok ? C.greenSoft : isCurrent ? C.amberSoft : C.white, align: 'center' }); ws.getCell(cr, 14).border = boxBorder
      cr++
    }
    if (rec.length) {
      cellText(ws, cr, 9, 'Total / month', { bold: true, fill: C.zebra })
      const rc = ws.getCell(cr, 10); rc.value = { formula: `SUM(J${recStart}:J${cr - 1})`, result: rec.reduce((s, x) => s + num(x.amount), 0) }; style(rc, { num: true, bold: true, fill: C.zebra })
      for (let c = 11; c <= 14; c++) cellText(ws, cr, c, '', { fill: C.zebra }); cr++
    }
    cr++
    section(ws, cr, 9, 14, 'Bills & subscriptions', C.violet); cr++
    headers(ws, cr, 9, ['Name', 'Amount', 'Due day', 'Type', 'Status'], { right: [1, 2], fill: C.violetSoft }); ws.mergeCells(cr, 13, cr, 14); cr++
    if (!bills.length) { ws.mergeCells(cr, 9, cr, 14); cellText(ws, cr, 9, 'No bills added', { color: C.mute, italic: true }); cr++ }
    const bStart = cr
    for (const b of bills) {
      cellText(ws, cr, 9, b.title, { bold: true }); cellText(ws, cr, 10, num(b.amount), { num: true }); cellText(ws, cr, 11, b.due_day || '', { num: true, fmt: '0', align: 'center' })
      cellText(ws, cr, 12, String(b.type || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (m) => m.toUpperCase()), {})
      ws.mergeCells(cr, 13, cr, 14)
      const ok = paid.has(b.id)
      cellText(ws, cr, 13, b.monthly ? (ok ? '✔ Paid' : isCurrent ? 'Pending' : '—') : 'One-time', { bold: true, color: !b.monthly ? C.mute : ok ? C.green : isCurrent ? C.amber : C.mute, fill: !b.monthly ? C.white : ok ? C.greenSoft : isCurrent ? C.amberSoft : C.white, align: 'center' }); ws.getCell(cr, 14).border = boxBorder
      cr++
    }
    if (bills.length) {
      cellText(ws, cr, 9, 'Total', { bold: true, fill: C.zebra })
      const bc = ws.getCell(cr, 10); bc.value = { formula: `SUM(J${bStart}:J${cr - 1})`, result: bills.reduce((s, x) => s + num(x.amount), 0) }; style(bc, { num: true, bold: true, fill: C.zebra })
      for (let c = 11; c <= 14; c++) cellText(ws, cr, c, '', { fill: C.zebra })
    }
  }

  // ===================================== BANKS & CARDS ======================================
  {
    const ws = wb.addWorksheet('Banks & Cards', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.teal } } })
    ;[26, 18, 14, 16, 16, 16, 14, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w })
    banner(ws, 1, `WYLTH  ·  Banks & credit cards`, gen, 9)
    tile(ws, 4, 1, 2, 'BANK BALANCE', bankTotal, `${banks.length} accounts`, C.teal, C.tealSoft)
    tile(ws, 4, 3, 4, 'CASH IN HAND', cash, '', C.green, C.greenSoft)
    tile(ws, 4, 5, 6, 'CARD DUES', cardOutTotal, `${cards.length} card${cards.length === 1 ? '' : 's'}`, C.red, C.redSoft)
    tile(ws, 4, 7, 9, 'CASH + BANK − DUES', bankTotal + cash - cardOutTotal, '', C.violet, C.violetSoft)

    let r = 8
    section(ws, r, 1, 9, 'Bank accounts', C.teal); r++
    headers(ws, r, 1, ['Account', 'Bank', 'A/c no.', 'Purpose', 'Balance', 'Share of banks'], { right: [4, 5], fill: C.tealSoft }); ws.mergeCells(r, 7, r, 9); r++
    const PUR = { EMERGENCY: [C.amber, C.amberSoft], SAVINGS: [C.green, C.greenSoft], EXPENSE: [C.brand, C.brandSoft] }
    const bStart = r
    for (const b of banks) {
      const [pc, pf] = PUR[b.purpose] || [C.mute, C.white]
      cellText(ws, r, 1, b.name, { bold: true }); cellText(ws, r, 2, b.bank || '')
      cellText(ws, r, 3, b.account_number ? '••••' + String(b.account_number).slice(-4) : '', { color: C.mute, align: 'center' })
      cellText(ws, r, 4, b.purpose ? b.purpose.charAt(0) + b.purpose.slice(1).toLowerCase() : '', { bold: true, color: pc, fill: pf, align: 'center' })
      cellText(ws, r, 5, num(b.balance), { num: true, bold: true, color: num(b.balance) < 0 ? C.red : C.ink })
      ws.mergeCells(r, 6, r, 9); cellText(ws, r, 6, bankTotal ? num(b.balance) / bankTotal : 0, { num: true, fmt: PCT })
      for (let c = 7; c <= 9; c++) ws.getCell(r, c).border = boxBorder
      r++
    }
    if (banks.length) ws.addConditionalFormatting({ ref: `F${bStart}:F${r - 1}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF7FD0D2' }, gradient: false }] })
    cellText(ws, r, 1, 'TOTAL', { bold: true, color: C.white, fill: C.navy })
    for (const c of [2, 3, 4]) cellText(ws, r, c, '', { fill: C.navy })
    const tb = ws.getCell(r, 5); tb.value = { formula: `SUM(E${bStart}:E${r - 1})`, result: bankTotal }; style(tb, { num: true, bold: true, color: C.white, fill: C.navy })
    ws.mergeCells(r, 6, r, 9); cellText(ws, r, 6, '', { fill: C.navy })
    r += 2

    section(ws, r, 1, 9, 'Credit cards', C.red); r++
    headers(ws, r, 1, ['Card', 'Bank', 'Last 4', 'Credit limit', 'Outstanding', 'Available', 'Used %', 'Bill day', 'Due day'], { right: [3, 4, 5, 6], fill: C.redSoft }); r++
    if (!cards.length) { ws.mergeCells(r, 1, r, 9); cellText(ws, r, 1, 'No credit cards added', { color: C.mute, italic: true }); r++ }
    const cStart = r
    for (const c of cards) {
      const out = cardOut(c.id), lim = num(c.credit_limit), use = lim ? out / lim : 0
      cellText(ws, r, 1, c.name, { bold: true }); cellText(ws, r, 2, c.bank || ''); cellText(ws, r, 3, c.last4 ? '••••' + c.last4 : '', { color: C.mute, align: 'center' })
      cellText(ws, r, 4, lim, { num: true }); cellText(ws, r, 5, out, { num: true, bold: true, color: out > 0 ? C.red : C.green })
      cellText(ws, r, 6, lim - out, { num: true, color: C.green })
      cellText(ws, r, 7, use, { num: true, fmt: PCT, bold: true, color: use > 0.6 ? C.red : use > 0.3 ? C.amber : C.green, fill: use > 0.6 ? C.redSoft : use > 0.3 ? C.amberSoft : C.greenSoft })
      cellText(ws, r, 8, c.billing_day || '', { num: true, fmt: '0', align: 'center' }); cellText(ws, r, 9, c.due_day || '', { num: true, fmt: '0', align: 'center' })
      r++
    }
    if (cards.length) {
      cellText(ws, r, 1, 'TOTAL', { bold: true, color: C.white, fill: C.navy }); for (const c of [2, 3, 8, 9, 7]) cellText(ws, r, c, '', { fill: C.navy })
      for (const [col, f, res] of [[4, 'D', cards.reduce((s, c) => s + num(c.credit_limit), 0)], [5, 'E', cardOutTotal], [6, 'F', cards.reduce((s, c) => s + num(c.credit_limit), 0) - cardOutTotal]]) {
        const cc = ws.getCell(r, col); cc.value = { formula: `SUM(${f}${cStart}:${f}${r - 1})`, result: res }; style(cc, { num: true, bold: true, color: C.white, fill: C.navy })
      }
      r++
    }
    r++
    // card transactions this month
    const tx = db.prepare("SELECT t.*, c.name card FROM card_transactions t LEFT JOIN credit_cards c ON c.id=t.card_id WHERE substr(t.date,1,7)=? ORDER BY t.date, t.id").all(ym)
    section(ws, r, 1, 9, `Card transactions  ·  ${label}`, C.red); r++
    headers(ws, r, 1, ['Description', 'Card', 'Date', 'Category', 'Type', 'Amount'], { right: [5], fill: C.redSoft }); r++
    if (!tx.length) { ws.mergeCells(r, 1, r, 9); cellText(ws, r, 1, 'No card transactions this month', { color: C.mute, italic: true }); r++ }
    const tStart = r
    tx.forEach((t, i) => {
      const band = i % 2 ? C.zebra : C.white, pay = t.type === 'PAYMENT'
      cellText(ws, r, 1, t.title, { fill: band }); cellText(ws, r, 2, t.card || '', { fill: band }); cellText(ws, r, 3, fmtDate(t.date), { fmt: 'dd mmm yyyy', fill: band })
      cellText(ws, r, 4, t.category || '', { fill: band })
      cellText(ws, r, 5, pay ? 'Payment' : 'Spend', { bold: true, color: pay ? C.green : C.red, fill: pay ? C.greenSoft : C.redSoft, align: 'center' })
      cellText(ws, r, 6, num(t.amount), { num: true, color: pay ? C.green : C.ink, fill: band })
      r++
    })
    if (tx.length) {
      cellText(ws, r, 1, 'Spends − payments', { bold: true, fill: C.zebra }); for (const c of [2, 3, 4, 5]) cellText(ws, r, c, '', { fill: C.zebra })
      const net = tx.reduce((s, t) => s + (t.type === 'PAYMENT' ? -num(t.amount) : num(t.amount)), 0)
      const cc = ws.getCell(r, 6); cc.value = { formula: `SUMIF(E${tStart}:E${r - 1},"Spend",F${tStart}:F${r - 1})-SUMIF(E${tStart}:E${r - 1},"Payment",F${tStart}:F${r - 1})`, result: net }; style(cc, { num: true, bold: true, fill: C.zebra })
    }
  }

  // ===================================== INVESTMENTS ========================================
  {
    const ws = wb.addWorksheet('Investments', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.green } } })
    ;[34, 16, 14, 14, 14, 11, 12, 13, 13, 11].forEach((w, i) => { ws.getColumn(i + 1).width = w })
    banner(ws, 1, `WYLTH  ·  Investments`, gen, 10)
    const gl = portfolio - invested
    tile(ws, 4, 1, 1, 'TOTAL INVESTED', invested, `${invs.length} holdings`, C.brand, C.brandSoft)
    tile(ws, 4, 2, 3, 'CURRENT VALUE', portfolio, '', C.teal, C.tealSoft)
    tile(ws, 4, 4, 6, 'GAIN / LOSS', gl, invested ? `${gl >= 0 ? '▲' : '▼'} ${Math.abs((gl / invested) * 100).toFixed(1)}% overall` : '', gl >= 0 ? C.green : C.red, gl >= 0 ? C.greenSoft : C.redSoft)
    tile(ws, 4, 7, 10, 'ADDED THIS MONTH', investedThisMonth, label, C.violet, C.violetSoft)

    const TYPES = {
      SIP: ['Mutual fund SIPs', C.brand, C.brandSoft], STOCKS: ['Stocks', C.teal, C.tealSoft], PPF: ['PPF / EPF', C.green, C.greenSoft],
      METALS: ['Gold & metals', C.amber, C.amberSoft], FD: ['Fixed deposits', C.violet, C.violetSoft], RD: ['Recurring deposits', C.violet, C.violetSoft],
    }
    const meta = (t) => TYPES[t] || [String(t || 'Other').charAt(0) + String(t || 'other').slice(1).toLowerCase(), C.navy, C.zebra]
    const groups = new Map()
    for (const i of invs) { if (!groups.has(i.type)) groups.set(i.type, []); groups.get(i.type).push(i) }

    // allocation table
    let r = 8
    section(ws, r, 1, 10, 'Allocation  ·  where your investments sit', C.green); r++
    headers(ws, r, 1, ['Category', 'Holdings', 'Invested', 'Current value', 'Gain / loss', 'Return %', 'Share'], { right: [1, 2, 3, 4, 5, 6], fill: C.greenSoft }); ws.mergeCells(r, 7, r, 8); r++
    const allocStart = r
    for (const [t, rows] of groups) {
      const [nm, col] = meta(t)
      const inv = rows.reduce((s, x) => s + num(x.invested_amount), 0), cur = rows.reduce((s, x) => s + num(x.current_value || x.invested_amount), 0)
      cellText(ws, r, 1, nm, { bold: true, color: col }); cellText(ws, r, 2, rows.length, { num: true, fmt: '0' })
      cellText(ws, r, 3, inv, { num: true }); cellText(ws, r, 4, cur, { num: true, bold: true })
      cellText(ws, r, 5, cur - inv, { num: true, bold: true, color: cur - inv >= 0 ? C.green : C.red })
      cellText(ws, r, 6, inv ? (cur - inv) / inv : 0, { num: true, fmt: '▲ 0.0%;▼ 0.0%;0.0%', bold: true, color: cur - inv >= 0 ? C.green : C.red })
      ws.mergeCells(r, 7, r, 8); cellText(ws, r, 7, portfolio ? cur / portfolio : 0, { num: true, fmt: PCT }); ws.getCell(r, 8).border = boxBorder
      r++
    }
    if (groups.size) ws.addConditionalFormatting({ ref: `G${allocStart}:G${r - 1}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF7AD0A6' }, gradient: false }] })
    r += 1

    // detail per category
    for (const [t, rows] of groups) {
      const [nm, col, soft] = meta(t)
      section(ws, r, 1, 10, nm, col); r++
      headers(ws, r, 1, ['Name', 'Platform', 'Invested', 'Current value', 'Gain / loss', 'Return %', 'Units', 'Monthly SIP', 'Since', 'Share'], { right: [2, 3, 4, 5, 6, 7, 9], fill: soft }); r++
      const s0 = r
      rows.forEach((x, i) => {
        const inv = num(x.invested_amount), cur = num(x.current_value || x.invested_amount), g = cur - inv
        const band = i % 2 ? C.zebra : C.white
        cellText(ws, r, 1, x.title, { bold: true, fill: band }); cellText(ws, r, 2, x.platform || '', { fill: band, color: C.mute })
        cellText(ws, r, 3, inv, { num: true, fill: band }); cellText(ws, r, 4, cur, { num: true, bold: true, fill: band })
        cellText(ws, r, 5, g, { num: true, bold: true, color: g >= 0 ? C.green : C.red, fill: g >= 0 ? C.greenSoft : C.redSoft })
        cellText(ws, r, 6, inv ? g / inv : 0, { num: true, fmt: '▲ 0.0%;▼ 0.0%;0.0%', bold: true, color: g >= 0 ? C.green : C.red, fill: g >= 0 ? C.greenSoft : C.redSoft })
        cellText(ws, r, 7, x.units ? num(x.units) : '', { num: true, fmt: '#,##0.###', fill: band })
        cellText(ws, r, 8, num(x.sip_amount) || '', { num: true, fill: band })
        cellText(ws, r, 9, x.date ? fmtDate(x.date) : '', { fmt: 'mmm yyyy', fill: band, align: 'center' })
        cellText(ws, r, 10, portfolio ? cur / portfolio : 0, { num: true, fmt: PCT, fill: band })
        r++
      })
      ws.addConditionalFormatting({ ref: `J${s0}:J${r - 1}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFBFD3F7' }, gradient: false }] })
      cellText(ws, r, 1, `Total · ${nm}`, { bold: true, color: C.white, fill: col }); cellText(ws, r, 2, '', { fill: col })
      const iv = rows.reduce((s, x) => s + num(x.invested_amount), 0), cv = rows.reduce((s, x) => s + num(x.current_value || x.invested_amount), 0)
      for (const [c, f, v] of [[3, 'C', iv], [4, 'D', cv], [5, 'E', cv - iv]]) {
        const cc = ws.getCell(r, c); cc.value = c === 5 ? { formula: `D${r}-C${r}`, result: v } : { formula: `SUM(${f}${s0}:${f}${r - 1})`, result: v }
        style(cc, { num: true, bold: true, color: C.white, fill: col })
      }
      cellText(ws, r, 6, iv ? (cv - iv) / iv : 0, { num: true, fmt: '▲ 0.0%;▼ 0.0%;0.0%', bold: true, color: C.white, fill: col })
      for (const c of [7, 8, 9, 10]) cellText(ws, r, c, '', { fill: col })
      r += 2
    }
    if (!groups.size) { ws.mergeCells(r, 1, r, 10); cellText(ws, r, 1, 'No active investments', { color: C.mute, italic: true }); r += 2 }

    // sold
    const sold = db.prepare('SELECT * FROM investment_sales ORDER BY sell_date DESC').all()
    if (sold.length) {
      section(ws, r, 1, 10, 'Sold investments', C.navy); r++
      headers(ws, r, 1, ['Name', 'Type', 'Sold on', 'Cost', 'Proceeds', 'Gain / loss', 'Est. tax'], { right: [3, 4, 5, 6], fill: C.zebra }); r++
      for (const s of sold) {
        cellText(ws, r, 1, s.title, { bold: true }); cellText(ws, r, 2, s.type || '', {}); cellText(ws, r, 3, s.sell_date ? fmtDate(s.sell_date) : '', { fmt: 'dd mmm yyyy' })
        cellText(ws, r, 4, num(s.cost_basis), { num: true }); cellText(ws, r, 5, num(s.net_proceeds), { num: true })
        cellText(ws, r, 6, num(s.gain), { num: true, bold: true, color: num(s.gain) >= 0 ? C.green : C.red, fill: num(s.gain) >= 0 ? C.greenSoft : C.redSoft })
        cellText(ws, r, 7, num(s.est_tax), { num: true, color: C.mute }); r++
      }
    }
  }

  for (const ws of wb.worksheets) {
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  }
  return wb
}

function fmtINR(n) {
  const v = Math.round(Number(n) || 0)
  const neg = v < 0; let s = String(Math.abs(v))
  if (s.length > 3) { const last = s.slice(-3); let rest = s.slice(0, -3); rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ','); s = rest + ',' + last }
  return (neg ? '-' : '') + '₹' + s
}

module.exports = { buildMonthlyWorkbook, availableMonths, fileNameFor, MONTHS }
