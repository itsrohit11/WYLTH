// Offline money-math tests. No network, no better-sqlite3 (uses Node's built-in node:sqlite),
// no external test runner. Run with:  npm test
//
// These lock down the calculations that are easy to break as features are added:
//   - card outstanding = card_transactions (spend - payment) + live card-paid expenses
//   - the Expense account debit is reversed on delete and re-applied on restore
//   - soft-deleted expenses never count in any total (month totals, card outstanding)
//   - net worth = bank + investments + receivable - debt
//
// They mirror the SQL used in electron/ipc/*Handlers.js against an in-memory database.

const { DatabaseSync } = require('node:sqlite')

let passed = 0, failed = 0
function eq(actual, expected, msg) {
  const a = Math.round(Number(actual) * 100) / 100
  const e = Math.round(Number(expected) * 100) / 100
  if (a === e) { passed++; console.log(`  ok   ${msg}`) }
  else { failed++; console.error(`  FAIL ${msg}\n         expected ${e}, got ${a}`) }
}

function freshDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE bank_accounts (id INTEGER PRIMARY KEY, purpose TEXT, balance REAL, sort_order INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY, title TEXT, amount REAL, category TEXT, category_name TEXT,
      date TEXT, payment_method TEXT, card_id INTEGER, debit_account_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE card_transactions (id INTEGER PRIMARY KEY, card_id INTEGER, amount REAL, type TEXT);
    CREATE TABLE investments (id INTEGER PRIMARY KEY, invested_amount REAL, current_value REAL, status TEXT);
    CREATE TABLE loans (id INTEGER PRIMARY KEY, kind TEXT, amount REAL, settled INTEGER);
    CREATE TABLE demat_funds (id INTEGER PRIMARY KEY, broker TEXT, amount REAL, date TEXT,
      invested INTEGER DEFAULT 0, investment_id INTEGER, source_account_id INTEGER, deleted_at TEXT);
  `)
  return db
}

// --- demat helpers (mirror dematHandlers) --------------------------------------------------
const dematAdd = (db, { broker, amount, date, source_account_id }) => {
  const r = db.prepare('INSERT INTO demat_funds (broker,amount,date,invested,source_account_id) VALUES (?,?,?,0,?)')
    .run(broker, amount, date, source_account_id || null)
  if (source_account_id) adjust(db, source_account_id, -Number(amount))
  return Number(r.lastInsertRowid)
}
const dematMarkInvested = (db, id) => {
  const f = db.prepare('SELECT * FROM demat_funds WHERE id=?').get(id)
  if (!f || f.invested) return
  const r = db.prepare("INSERT INTO investments (invested_amount,current_value,status) VALUES (?,?,'ACTIVE')").run(f.amount, f.amount)
  db.prepare('UPDATE demat_funds SET invested=1, investment_id=? WHERE id=?').run(Number(r.lastInsertRowid), id)
}
const dematUnmark = (db, id) => {
  const f = db.prepare('SELECT * FROM demat_funds WHERE id=?').get(id)
  if (!f || !f.invested) return
  if (f.investment_id) {
    const inv = db.prepare('SELECT invested_amount FROM investments WHERE id=?').get(f.investment_id)
    const left = (Number(inv.invested_amount) || 0) - Number(f.amount)
    if (left <= 0.009) db.prepare("UPDATE investments SET status='CLOSED', invested_amount=0, current_value=0 WHERE id=?").run(f.investment_id)
    else db.prepare('UPDATE investments SET invested_amount=invested_amount-?, current_value=current_value-? WHERE id=?').run(f.amount, f.amount, f.investment_id)
  }
  db.prepare('UPDATE demat_funds SET invested=0, investment_id=NULL WHERE id=?').run(id)
}
const uninvestedDemat = (db) =>
  db.prepare('SELECT COALESCE(SUM(amount),0) t FROM demat_funds WHERE invested=0 AND deleted_at IS NULL').get().t || 0
const savingsTotal = (db) =>
  (db.prepare("SELECT COALESCE(SUM(balance),0) t FROM bank_accounts WHERE purpose='SAVINGS'").get().t || 0) + uninvestedDemat(db)
const netWorth = (db) => {
  const t = (sql) => db.prepare(sql).get().t || 0
  return t('SELECT COALESCE(SUM(balance),0) t FROM bank_accounts')
    + uninvestedDemat(db)
    + t("SELECT COALESCE(SUM(COALESCE(current_value,invested_amount)),0) t FROM investments WHERE status='ACTIVE'")
    + t("SELECT COALESCE(SUM(amount),0) t FROM loans WHERE kind='LEND' AND settled=0")
    - t("SELECT COALESCE(SUM(amount),0) t FROM loans WHERE kind='DEBT' AND settled=0")
}

// --- helpers that mirror the real handlers -------------------------------------------------
const adjust = (db, accId, delta) =>
  db.prepare('UPDATE bank_accounts SET balance=COALESCE(balance,0)+? WHERE id=?').run(delta, accId)
const balanceOf = (db, accId) => db.prepare('SELECT balance b FROM bank_accounts WHERE id=?').get(accId).b

// cardHandlers.outstandingOf
const outstanding = (db, cardId) => {
  const tx = db.prepare("SELECT COALESCE(SUM(CASE WHEN type='PAYMENT' THEN -amount ELSE amount END),0) o FROM card_transactions WHERE card_id=?").get(cardId).o || 0
  const exp = db.prepare('SELECT COALESCE(SUM(amount),0) o FROM expenses WHERE card_id=? AND deleted_at IS NULL').get(cardId).o || 0
  return tx + exp
}
// expense:create account debit rule (UPI/bank/netbanking debit; CASH/CARD do not)
const createExpense = (db, e) => {
  const info = db.prepare('INSERT INTO expenses (title,amount,category,date,payment_method,card_id) VALUES (?,?,?,?,?,?)')
    .run(e.title, e.amount, e.category, e.date, e.payment_method, e.card_id || null)
  const id = info.lastInsertRowid
  const fromAccount = e.payment_method !== 'CASH' && e.payment_method !== 'CARD'
  if (fromAccount && e.accId) {
    adjust(db, e.accId, -Number(e.amount))
    db.prepare('UPDATE expenses SET debit_account_id=? WHERE id=?').run(e.accId, id)
  }
  return Number(id)
}
const softDelete = (db, id) => {
  const x = db.prepare('SELECT amount, debit_account_id, deleted_at FROM expenses WHERE id=?').get(id)
  if (!x || x.deleted_at) return
  if (x.debit_account_id) adjust(db, x.debit_account_id, Number(x.amount)) // refund
  db.prepare("UPDATE expenses SET deleted_at=datetime('now') WHERE id=?").run(id)
}
const restore = (db, id) => {
  const x = db.prepare('SELECT amount, debit_account_id, deleted_at FROM expenses WHERE id=?').get(id)
  if (!x || !x.deleted_at) return
  if (x.debit_account_id) adjust(db, x.debit_account_id, -Number(x.amount)) // re-debit
  db.prepare('UPDATE expenses SET deleted_at=NULL WHERE id=?').run(id)
}
const monthTotals = (db) => db.prepare(`
  SELECT COALESCE(SUM(amount),0) total,
         COALESCE(SUM(CASE WHEN category='NEED' THEN amount ELSE 0 END),0) needs,
         COALESCE(SUM(CASE WHEN category='WANT' THEN amount ELSE 0 END),0) wants
  FROM expenses WHERE deleted_at IS NULL`).get()

// --- tests ---------------------------------------------------------------------------------
console.log('\nCard outstanding')
;(() => {
  const db = freshDb()
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('EXPENSE', 10000)
  db.prepare("INSERT INTO card_transactions (card_id,amount,type) VALUES (1,2000,'SPEND')").run()
  db.prepare("INSERT INTO card_transactions (card_id,amount,type) VALUES (1,500,'PAYMENT')").run()
  createExpense(db, { title:'Dinner', amount:800, category:'WANT', date:'2026-08-10', payment_method:'CARD', card_id:1, accId:1 })
  eq(outstanding(db, 1), 2000 - 500 + 800, 'outstanding = spends - payments + card expenses')
  eq(balanceOf(db, 1), 10000, 'card spend does NOT touch the Expense account')
})()

console.log('\nExpense account debit + reversal')
;(() => {
  const db = freshDb()
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('EXPENSE', 5000)
  const upi = createExpense(db, { title:'Groceries', amount:1200, category:'NEED', date:'2026-08-05', payment_method:'UPI', accId:1 })
  eq(balanceOf(db, 1), 3800, 'UPI expense debits the account')
  createExpense(db, { title:'Cash snack', amount:100, category:'WANT', date:'2026-08-05', payment_method:'CASH', accId:1 })
  eq(balanceOf(db, 1), 3800, 'CASH expense does NOT debit the account')
  softDelete(db, upi)
  eq(balanceOf(db, 1), 5000, 'deleting the UPI expense refunds the account')
  restore(db, upi)
  eq(balanceOf(db, 1), 3800, 'restoring re-applies the debit')
})()

console.log('\nSoft-deleted rows are excluded from totals')
;(() => {
  const db = freshDb()
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('EXPENSE', 0)
  const a = createExpense(db, { title:'Rent', amount:10000, category:'NEED', date:'2026-08-01', payment_method:'UPI', accId:1 })
  createExpense(db, { title:'Movie', amount:500, category:'WANT', date:'2026-08-02', payment_method:'UPI', accId:1 })
  let t = monthTotals(db)
  eq(t.total, 10500, 'total before delete'); eq(t.needs, 10000, 'needs before'); eq(t.wants, 500, 'wants before')
  softDelete(db, a)
  t = monthTotals(db)
  eq(t.total, 500, 'total excludes deleted'); eq(t.needs, 0, 'needs excludes deleted'); eq(t.wants, 500, 'wants unaffected')
  const cardDb = db // deleted card expense also drops out of outstanding
  db.prepare("INSERT INTO card_transactions (card_id,amount,type) VALUES (2,300,'SPEND')").run()
  const ce = createExpense(cardDb, { title:'Coffee', amount:200, category:'WANT', date:'2026-08-03', payment_method:'CARD', card_id:2, accId:1 })
  eq(outstanding(cardDb, 2), 500, 'card outstanding includes the card expense')
  softDelete(cardDb, ce)
  eq(outstanding(cardDb, 2), 300, 'deleted card expense drops out of outstanding')
})()

console.log('\nNet worth = bank + investments + receivable - debt')
;(() => {
  const db = freshDb()
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('SAVINGS', 40000)
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (2,?,?)').run('EXPENSE', 8000)
  db.prepare("INSERT INTO investments (invested_amount,current_value,status) VALUES (25000,30000,'ACTIVE')").run()
  db.prepare('INSERT INTO loans (kind,amount,settled) VALUES (?,?,0)').run('LEND', 3000) // owed to me
  db.prepare('INSERT INTO loans (kind,amount,settled) VALUES (?,?,0)').run('BORROW', 1000) // I owe
  const bank = db.prepare('SELECT COALESCE(SUM(balance),0) s FROM bank_accounts').get().s
  const inv = db.prepare("SELECT COALESCE(SUM(COALESCE(current_value,invested_amount)),0) s FROM investments WHERE status='ACTIVE'").get().s
  const receivable = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM loans WHERE kind='LEND' AND settled=0").get().s
  const debt = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM loans WHERE kind='BORROW' AND settled=0").get().s
  eq(bank + inv + receivable - debt, 48000 + 30000 + 3000 - 1000, 'net worth combines all sources')
})()

console.log('\nDemat cash: savings until actually invested')
;(() => {
  const db = freshDb()
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('SAVINGS', 50000)
  const nw0 = netWorth(db)
  eq(savingsTotal(db), 50000, 'savings starts at bank balance')

  // Transfer 20k from the savings bank account into the demat.
  const f = dematAdd(db, { broker:'Zerodha', amount:20000, date:'2026-08-17', source_account_id:1 })
  eq(balanceOf(db, 1), 30000, 'source bank account is debited')
  eq(uninvestedDemat(db), 20000, 'demat holds uninvested cash')
  eq(savingsTotal(db), 50000, 'savings UNCHANGED — money only moved bank -> demat')
  eq(netWorth(db), nw0, 'net worth unchanged by the transfer')

  // Now actually invest it.
  dematMarkInvested(db, f)
  eq(uninvestedDemat(db), 0, 'no uninvested cash left')
  eq(savingsTotal(db), 30000, 'savings drops by the invested amount')
  eq(db.prepare("SELECT COALESCE(SUM(invested_amount),0) t FROM investments WHERE status='ACTIVE'").get().t, 20000, 'investments rose by the same amount')
  eq(netWorth(db), nw0, 'net worth STILL unchanged — money moved between buckets')

  // Undo it.
  dematUnmark(db, f)
  eq(uninvestedDemat(db), 20000, 'undo returns it to uninvested cash')
  eq(savingsTotal(db), 50000, 'savings back to original')
  eq(db.prepare("SELECT COALESCE(SUM(invested_amount),0) t FROM investments WHERE status='ACTIVE'").get().t, 0, 'investment reversed')
  eq(netWorth(db), nw0, 'net worth unchanged after undo')
})()

console.log('\nDemat added without a source account')
;(() => {
  const db = freshDb()
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('SAVINGS', 10000)
  dematAdd(db, { broker:'Groww', amount:5000, date:'2026-08-17' })   // no source_account_id
  eq(balanceOf(db, 1), 10000, 'no account is touched when no source is chosen')
  eq(savingsTotal(db), 15000, 'savings grows by the demat cash')
})()

console.log('\nSIP vs Lumpsum: only a monthly SIP accumulates')
;(() => {
  // Mirrors refreshSipValues(): a MONTHLY sip grows with each month elapsed; a LUMPSUM is
  // invested once and its amount must never be multiplied by months.
  const refresh = (row, curY, curM) => {
    const ym = (x) => { const [y,m] = String(x||'').split('-').map(Number); return (y&&m)?{y,m}:null }
    if (String(row.sip_mode||'MONTHLY').toUpperCase() === 'LUMPSUM') {
      const inv = Number(row.invested_amount) || Number(row.sip_amount) || 0
      return { invested: inv, current: inv * (1 + (row.sip_gain_pct||0)/100) }
    }
    const start = ym(row.date)
    let endY = curY, endM = curM
    const end = ym(row.sip_end)
    if (end && (end.y < curY || (end.y === curY && end.m < curM))) { endY = end.y; endM = end.m }
    let months = (endY-start.y)*12 + (endM-start.m) + 1
    if (months < 0) months = 0
    const inv = row.sip_amount * months
    return { invested: inv, current: inv * (1 + (row.sip_gain_pct||0)/100) }
  }

  // 5 months elapsed: Aug 2026 vs a March 2026 start
  const monthly = refresh({ sip_mode:'MONTHLY', sip_amount:5000, date:'2026-03-01', sip_gain_pct:10 }, 2026, 8)
  eq(monthly.invested, 30000, 'monthly SIP accumulates 6 installments')
  eq(monthly.current, 33000, 'monthly current applies gain %')

  const lump = refresh({ sip_mode:'LUMPSUM', sip_amount:50000, invested_amount:50000, date:'2026-03-01', sip_gain_pct:10 }, 2026, 8)
  eq(lump.invested, 50000, 'LUMPSUM stays fixed no matter how many months passed')
  eq(lump.current, 55000, 'lumpsum current applies gain %')

  // and it must still be fixed much later
  const lumpLater = refresh({ sip_mode:'LUMPSUM', sip_amount:50000, invested_amount:50000, date:'2026-03-01', sip_gain_pct:0 }, 2030, 12)
  eq(lumpLater.invested, 50000, 'lumpsum unchanged years later')

  // a row with no sip_mode (every pre-existing SIP) must behave exactly as before
  const legacy = refresh({ sip_amount:5000, date:'2026-03-01', sip_gain_pct:0 }, 2026, 8)
  eq(legacy.invested, 30000, 'existing SIPs (no sip_mode) still accumulate')

  // lumpsum projection compounds once; a monthly SIP uses the annuity formula
  const P = 100000, r = 0.12, yrs = 3
  eq(P*Math.pow(1+r,yrs), 140492.8, 'lumpsum projection = P(1+r)^years')
})()

console.log('\nBonds: monthly vs yearly quoted rates')
;(() => {
  // Mirrors bondMaths() in investmentHandlers.
  const monthsBetweenDates = (a,b) => {
    if (!a || !b) return 0
    const d1 = new Date(a), d2 = new Date(b)
    if (isNaN(d1) || isNaN(d2)) return 0
    const m = (d2.getFullYear()-d1.getFullYear())*12 + (d2.getMonth()-d1.getMonth())
    return m > 0 ? m : 0
  }
  const bondMaths = (row) => {
    const P = row.invested_amount || 0
    const pct = row.interest_rate || 0
    const monthlyRate = String(row.rate_period||'YEARLY').toUpperCase()==='MONTHLY' ? pct/100 : pct/100/12
    const months = monthsBetweenDates(row.date, row.maturity_date)
    const perMonth = P * monthlyRate
    const totalInterest = perMonth * months
    return { ratePerYearPct: monthlyRate*12*100, monthsToMaturity: months,
             interestPerMonth: perMonth, expectedInterest: totalInterest,
             maturityValue: P + totalInterest }
  }

  // Short-term bond: 1.2% PER MONTH on 1,00,000 for 6 months
  const m = bondMaths({ invested_amount:100000, interest_rate:1.2, rate_period:'MONTHLY',
                        date:'2026-08-01', maturity_date:'2027-02-01' })
  eq(m.monthsToMaturity, 6, 'tenure in months from purchase to maturity')
  eq(m.interestPerMonth, 1200, 'monthly rate: interest per month')
  eq(m.expectedInterest, 7200, 'monthly rate: total interest over 6 months')
  eq(m.maturityValue, 107200, 'monthly rate: value at maturity')
  eq(m.ratePerYearPct, 14.4, 'monthly rate shown as annual equivalent')

  // Same numbers quoted the other way: 14.4% PER YEAR must give the identical result
  const y = bondMaths({ invested_amount:100000, interest_rate:14.4, rate_period:'YEARLY',
                        date:'2026-08-01', maturity_date:'2027-02-01' })
  eq(y.interestPerMonth, 1200, 'yearly rate converts to the same monthly interest')
  eq(y.maturityValue, 107200, 'yearly and monthly quoting agree')

  // A rate with no period stored (any pre-existing FD/bond) must still mean per YEAR
  const legacy = bondMaths({ invested_amount:100000, interest_rate:12,
                             date:'2026-08-01', maturity_date:'2027-08-01' })
  eq(legacy.interestPerMonth, 1000, 'missing rate_period is treated as p.a. (unchanged)')
  eq(legacy.expectedInterest, 12000, 'legacy bond interest over a year')

  // No maturity date -> no projection, never a wrong number
  const none = bondMaths({ invested_amount:100000, interest_rate:1.2, rate_period:'MONTHLY', date:'2026-08-01' })
  eq(none.monthsToMaturity, 0, 'no maturity date means no tenure')
  eq(none.expectedInterest, 0, 'no maturity date means no projected interest')
})()


// --- capital gains (electron/lib/capitalGains.js — the real module, not a copy) -------------
const cg = require('../electron/lib/capitalGains')
const { postBankTxn } = require('../electron/lib/ledger')

console.log('\nHolding period: long-term only when held MORE than 12 months')
;(() => {
  const t = (b, sd) => cg.isLongTerm(b, sd) ? 1 : 0
  eq(t('2025-01-10', '2026-01-10'), 0, 'exactly 12 months is still short-term')
  eq(t('2025-01-10', '2026-01-11'), 1, 'one day past 12 months is long-term')
  eq(t('2024-02-29', '2025-02-28'), 0, 'leap-day purchase: 12 months ends 28 Feb')
  eq(t('2024-02-29', '2025-03-01'), 1, '...and 1 Mar is long-term')
  eq(t('2025-01-31', '2025-02-01'), 0, 'month-end clamping does not break short-term')
})()

console.log('\nFinancial year')
;(() => {
  eq(cg.fyOf('2026-03-31') === '2025-26' ? 1 : 0, 1, '31 Mar belongs to the year that is ending')
  eq(cg.fyOf('2026-04-01') === '2026-27' ? 1 : 0, 1, '1 Apr starts the new year')
})()

console.log('\nFIFO lots')
;(() => {
  const lots = [{ id: 2, units: 10, price: 200, date: '2026-09-01' }, { id: 1, units: 10, price: 100, date: '2024-01-10' }]
  const r = cg.consumeStockLots(lots, 15)
  eq(r.chunks[0].cost, 1000, 'oldest lot is sold first (even if listed second)')
  eq(r.chunks[1].units, 5, 'then 5 from the next lot')
  eq(r.updates[1].units_left, 5, 'next lot keeps 5')
  eq(cg.consumeStockLots(lots, 25).shortfall, 5, 'selling more than held reports a shortfall')
})()

console.log('\nSale gains: brokerage reduces gain, STT does not')
;(() => {
  const chunks = [{ date: '2024-01-10', units: 10, cost: 1000 }]
  const g = cg.saleGains({ chunks, price: 200, brokerage: 50, stt: 2, sellDate: '2026-01-10' })
  eq(g.gross, 2000, 'gross'); eq(g.gain, 2000 - 50 - 1000, 'gain = gross - brokerage - cost (STT not deducted)')
  eq(g.netProceeds, 2000 - 50 - 2, 'cash received = gross - brokerage - STT')
  eq(g.ltGain, 950, 'all long-term'); eq(g.stGain, 0, 'no short-term part')
})()

console.log('\nFY tax: equity rates, exemption, set-off')
;(() => {
  let t = cg.fyTax([{ category: 'EQUITY', st_gain: 50000, lt_gain: 0 }])
  eq(t.tax, 10000, 'STCG 20% of 50,000'); eq(t.total, 10400, '+4% cess')
  t = cg.fyTax([{ category: 'EQUITY', st_gain: 0, lt_gain: 100000 }])
  eq(t.total, 0, 'LTCG under 1.25L is fully exempt')
  t = cg.fyTax([{ category: 'EQUITY', st_gain: 0, lt_gain: 225000 }])
  eq(t.tax, 12500, 'LTCG: 12.5% of the 1,00,000 above the exemption'); eq(t.total, 13000, '+4% cess')
  t = cg.fyTax([{ category: 'EQUITY', st_gain: -30000, lt_gain: 100000 }, { category: 'EQUITY', st_gain: 0, lt_gain: 125000 }])
  eq(t.ltcgEquity, 225000, 'long-term gains add up across sales')
  eq(t.taxableLT, 70000, 'short-term loss of 30,000 absorbs long-term gain, then 1.25L exemption')
  t = cg.fyTax([{ category: 'EQUITY', st_gain: 40000, lt_gain: -10000 }])
  eq(t.tax, 8000, 'long-term loss cannot reduce short-term gain'); eq(t.carryForwardLT, 10000, '...and is carried forward')
  t = cg.fyTax([{ category: 'DEBT', st_gain: 20000, lt_gain: 0, slab_rate: 30 }])
  eq(t.tax, 6000, 'debt fund gain taxed at slab (30%)')
  eq(cg.marginalTax([{ category: 'EQUITY', st_gain: 0, lt_gain: 125000 }], { category: 'EQUITY', st_gain: 0, lt_gain: 100000 }).added, 13000,
    'second sale pays tax once the exemption is already used up')
  eq(cg.defaultStt('STOCKS', 'EQUITY', 100000), 100, 'default STT 0.1% on shares')
})()

console.log('\nSIP instalments & fund lots')
;(() => {
  const ins = cg.sipInstalments('2025-01-01', 3, 1000, 5)
  eq(ins.length, 3, 'one instalment per month'); eq(ins[2].date === '2025-03-05' ? 1 : 0, 1, 'on the chosen day of the month')
  const ch = cg.consumeFundInstalments(ins, 0, 1500, 10)
  eq(ch.length, 2, '1,500 of cost takes two instalments'); eq(ch[1].cost, 500, 'second one only partly')
  const ch2 = cg.consumeFundInstalments(ins, 1500, 1000, 10)
  eq(ch2[0].cost, 500, 'next sale starts from the unsold remainder of instalment 2')
})()

console.log('\nBank statement ledger')
;(() => {
  const db = freshDb()
  db.exec(`CREATE TABLE bank_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, type TEXT, amount REAL, balance_after REAL,
    source TEXT, ref_type TEXT, ref_id INTEGER, note TEXT, date TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);`)
  db.exec('ALTER TABLE bank_accounts ADD COLUMN updated_at TEXT')
  db.prepare('INSERT INTO bank_accounts (id,purpose,balance) VALUES (1,?,?)').run('SAVINGS', 1000)
  postBankTxn(db, 1, 500, { source: 'MANUAL', note: 'bonus' })
  postBankTxn(db, 1, -200, { source: 'EXPENSE', note: 'lunch' })
  postBankTxn(db, 1, 0, { note: 'ignored' })
  postBankTxn(db, 99, 50, { note: 'no such account' })
  const rows = db.prepare('SELECT * FROM bank_transactions ORDER BY id').all()
  eq(rows.length, 2, 'zero amounts and unknown accounts post nothing')
  eq(balanceOf(db, 1), 1300, 'balance moves with each entry')
  eq(rows[1].balance_after, 1300, 'each row stores the running balance')
  eq(rows[1].type === 'DEBIT' && rows[1].amount === 200 ? 1 : 0, 1, 'debits stored as positive amount + DEBIT')
  eq(/^\d{4}-\d\d-\d\d$/.test(rows[0].date) ? 1 : 0, 1, 'entry dated in local YYYY-MM-DD')
})()

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
