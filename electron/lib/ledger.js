// Bank statement ledger.
//
// EVERY change to a bank account balance goes through postBankTxn(), which updates the balance
// and writes one statement row (with the balance after the change). That's what makes the
// per-account statement complete: money in, money out, and why.
//
// Deliberately free of any Electron import so the money tests can exercise it directly.

const pad2 = (n) => String(n).padStart(2, '0')

// Today's date in LOCAL time (YYYY-MM-DD). toISOString() would give the UTC date, which is
// yesterday in India before 5:30 AM.
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Record a change of `delta` rupees (+ credit / − debit) on account `accId`.
// Returns the statement row id, or null when there was nothing to post.
function postBankTxn(db, accId, delta, { source = 'MANUAL', note = null, refType = null, refId = null, date = null } = {}) {
  const amt = Number(delta) || 0
  if (!accId || !amt) return null
  const acc = db.prepare('SELECT id FROM bank_accounts WHERE id=?').get(accId)
  if (!acc) return null
  db.prepare("UPDATE bank_accounts SET balance=COALESCE(balance,0)+?, updated_at=datetime('now') WHERE id=?").run(amt, accId)
  const after = db.prepare('SELECT balance FROM bank_accounts WHERE id=?').get(accId).balance
  const r = db.prepare(`
    INSERT INTO bank_transactions (account_id, type, amount, balance_after, source, ref_type, ref_id, note, date)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(accId, amt > 0 ? 'CREDIT' : 'DEBIT', Math.abs(amt), after, source, refType, refId ?? null, note, date || localToday())
  try {
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('last_change:bank', ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(new Date().toISOString())
  } catch {}
  return Number(r.lastInsertRowid)
}

// The first time statements exist, every account already has a balance with no history.
// Give each one an opening row so the statement's running balance reconciles.
function seedOpeningBalances(db) {
  const done = db.prepare("SELECT value FROM app_settings WHERE key='bank_statement_seeded'").get()
  if (done) return
  const accs = db.prepare('SELECT id, balance FROM bank_accounts').all()
  const ins = db.prepare(`INSERT INTO bank_transactions (account_id, type, amount, balance_after, source, note, date)
    VALUES (?,?,?,?, 'OPENING', 'Balance carried forward (statement started)', ?)`)
  for (const a of accs) {
    const has = db.prepare('SELECT 1 FROM bank_transactions WHERE account_id=? LIMIT 1').get(a.id)
    const bal = Number(a.balance) || 0
    if (!has && bal) ins.run(a.id, bal >= 0 ? 'CREDIT' : 'DEBIT', Math.abs(bal), bal, localToday())
  }
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('bank_statement_seeded','1')").run()
}

// The account everyday spending (and rent / utility bills) comes out of: your first account
// whose purpose is EXPENSE. Returns its id, or null when none is set up.
function primaryExpenseAccount(db) {
  return db.prepare("SELECT id FROM bank_accounts WHERE purpose='EXPENSE' ORDER BY COALESCE(sort_order,999999), created_at DESC LIMIT 1").get()?.id || null
}

module.exports = { postBankTxn, seedOpeningBalances, localToday, primaryExpenseAccount }
