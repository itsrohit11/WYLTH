const path = require('path')
const { app } = require('electron')
const Database = require('better-sqlite3')
const fs = require('fs')
const zlib = require('zlib')

let db = null

// Bump this whenever migrateSchema() gains a new change. On launch, if the database's
// stored user_version is lower, we take a one-time compressed snapshot BEFORE migrating,
// so a bad upgrade can always be rolled back. Purely local — snapshots live on this PC.
const SCHEMA_VERSION = 6

function backupsDir() {
  const d = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

// Gzip the live database file to backups/finance-<name>.db.gz. Checkpoints the WAL first so
// the snapshot is complete. Returns the file path, or null on any failure (never throws —
// a backup problem must not stop the app from opening the user's data).
function snapshot(name, { overwrite = true } = {}) {
  try {
    try { db.pragma('wal_checkpoint(TRUNCATE)') } catch {}
    const file = path.join(backupsDir(), `finance-${name}.db.gz`)
    if (!overwrite && fs.existsSync(file)) return file
    fs.writeFileSync(file, zlib.gzipSync(fs.readFileSync(db.name), { level: 9 }))
    return file
  } catch (e) { console.warn(`snapshot "${name}" skipped:`, e.message); return null }
}

// One rolling snapshot per calendar day, keeping the most recent 14. This is on top of the
// per-month backup (backupHandlers) and the pre-migration snapshot below.
function dailyBackup() {
  const tag = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (local-ish, fine for a tag)
  snapshot(`daily-${tag}`, { overwrite: false })
  try {
    const dailies = fs.readdirSync(backupsDir())
      .filter((f) => f.startsWith('finance-daily-') && f.endsWith('.db.gz')).sort()
    while (dailies.length > 14) { const old = dailies.shift(); fs.unlinkSync(path.join(backupsDir(), old)) }
  } catch {}
}

// The app used to be called "Finance Tracker" (and runs as "finance-desktop" in dev), each
// of which puts the database in a differently-named userData folder. On the first launch
// under a new name, bring an existing database across so nothing appears lost. This only
// ever COPIES — the old file is left untouched — and a brand-new install (no old folder)
// simply starts empty.
const LEGACY_APP_FOLDERS = ['Bahi Khata', 'Finance Tracker', 'finance-desktop']

function migrateLegacyDb(target) {
  try {
    const appData = app.getPath('appData')
    for (const folder of LEGACY_APP_FOLDERS) {
      const legacy = path.join(appData, folder, 'finance.db')
      if (legacy === target || !fs.existsSync(legacy)) continue
      fs.copyFileSync(legacy, target)
      // Copy the WAL/SHM sidecars too, so recently-committed rows aren't missed.
      for (const ext of ['-wal', '-shm']) {
        if (fs.existsSync(legacy + ext)) fs.copyFileSync(legacy + ext, target + ext)
      }
      console.log('Carried existing database over from:', legacy)
      return
    }
  } catch (e) { console.warn('legacy database migration skipped:', e.message) }
}

function getDbPath() {
  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true })
  const target = path.join(userDataPath, 'finance.db')
  if (!fs.existsSync(target)) migrateLegacyDb(target)
  return target
}

function initDatabase() {
  const dbPath = getDbPath()
  const preExisted = fs.existsSync(dbPath)   // false only for a brand-new install
  console.log('Database path:', dbPath)
  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Protect existing data before we touch the schema. Skipped for a fresh install (nothing
  // to lose). All snapshots are local files under userData/backups.
  if (preExisted) {
    dailyBackup()
    const ver = db.pragma('user_version', { simple: true }) || 0
    if (ver < SCHEMA_VERSION) snapshot(`premigrate-v${ver}-${Date.now()}`)
    pruneSnapshots('finance-premigrate-', 10)
  }

  createTables()
  migrateSchema()
  require('./lib/ledger').seedOpeningBalances(db)
  db.pragma(`user_version = ${SCHEMA_VERSION}`)
  refreshSipValues()
  console.log('Database initialized')
  return db
}

// Keep at most `keep` of a snapshot family (oldest removed first).
function pruneSnapshots(prefix, keep) {
  try {
    const files = fs.readdirSync(backupsDir())
      .filter((f) => f.startsWith(prefix) && f.endsWith('.db.gz')).sort()
    while (files.length > keep) { const old = files.shift(); fs.unlinkSync(path.join(backupsDir(), old)) }
  } catch {}
}

// SIP "invested so far" is based on the CURRENT month (the end month is only a target
// reminder). Recompute each SIP's invested_amount/current_value against today so the
// stored figures stay correct for the portfolio, export and savings-balance calculations.
// months invested = start month -> min(this month, end month), inclusive.
function refreshSipValues() {
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1
  const ym = (s) => { const [y, m] = String(s || '').split('-').map(Number); return (y && m) ? { y, m } : null }
  // Fully redeemed (CLOSED) SIPs are frozen at zero. `sold_cost` is the cost basis of units
  // already sold, so a partly redeemed SIP keeps only the cost of what you still hold.
  const sips = db.prepare("SELECT id, sip_amount, sip_gain_pct, date, sip_end, units, current_price, invested_amount, sip_mode, sold_cost FROM investments WHERE type='SIP' AND COALESCE(status,'ACTIVE')<>'CLOSED'").all()
  const upd = db.prepare('UPDATE investments SET invested_amount=?, current_value=? WHERE id=?')
  for (const s of sips) {
    // A lumpsum is invested once — its amount never multiplies by months. Only its current
    // value is refreshed (units x NAV, or the estimated gain %).
    if (String(s.sip_mode || 'MONTHLY').toUpperCase() === 'LUMPSUM') {
      const soldLump = Number(s.sold_cost) || 0
      const baseLump = Number(s.sip_amount) > 0 ? Number(s.sip_amount) : (Number(s.invested_amount) || 0) + soldLump
      const investedLump = Math.max(0, baseLump - soldLump)
      const currentLump = (s.units > 0 && s.current_price > 0)
        ? s.units * s.current_price
        : investedLump * (1 + (s.sip_gain_pct || 0) / 100)
      upd.run(investedLump, currentLump, s.id)
      continue
    }
    if (!s.sip_amount) continue
    const start = ym(s.date)
    if (!start) continue
    // cap the end at the current month
    let endY = curY, endM = curM
    const end = ym(s.sip_end)
    if (end && (end.y < curY || (end.y === curY && end.m < curM))) { endY = end.y; endM = end.m }
    let months = (endY - start.y) * 12 + (endM - start.m) + 1
    if (months < 0) months = 0
    const invested = Math.max(0, s.sip_amount * months - (Number(s.sold_cost) || 0))
    // If you've entered actual units + NAV, value the SIP at units x NAV; otherwise fall back
    // to the estimated gain %.
    const current = (s.units > 0 && s.current_price > 0)
      ? s.units * s.current_price
      : invested * (1 + (s.sip_gain_pct || 0) / 100)
    upd.run(invested, current, s.id)
  }
}

// Adds columns introduced after a user's database was first created.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we check PRAGMA table_info first.
function migrateSchema() {
  const ensureColumn = (table, column, definition) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
    if (!cols.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }
  ensureColumn('investments', 'interest_rate', 'REAL')
  ensureColumn('investments', 'sip_amount', 'REAL')
  ensureColumn('investments', 'sip_end', 'TEXT')
  ensureColumn('investments', 'sip_gain_pct', 'REAL')
  ensureColumn('investments', 'last_traded_date', 'TEXT')
  ensureColumn('investments', 'auto_amount', 'REAL')
  ensureColumn('investments', 'auto_day', 'INTEGER')
  ensureColumn('investments', 'sort_order', 'INTEGER')
  ensureColumn('bank_accounts', 'sort_order', 'INTEGER')
  // Which bank account a loan was settled against (so undo can reverse the adjustment).
  ensureColumn('loans', 'settle_account_id', 'INTEGER')
  // Lock a loan entry so it can't be edited/settled/deleted until unlocked.
  ensureColumn('loans', 'locked', 'INTEGER DEFAULT 0')
  ensureColumn('bills', 'sort_order', 'INTEGER')
  ensureColumn('loans', 'sort_order', 'INTEGER')
  ensureColumn('recurring_expenses', 'sort_order', 'INTEGER')
  ensureColumn('savings', 'achieved', 'INTEGER DEFAULT 0')
  ensureColumn('savings', 'achieved_date', 'TEXT')
  ensureColumn('card_transactions', 'bank_account_id', 'INTEGER')   // account a card-bill payment came from
  ensureColumn('expenses', 'debit_account_id', 'INTEGER')   // which bank account an expense debited
  ensureColumn('expenses', 'card_id', 'INTEGER')            // credit card a card-paid expense belongs to
  // Soft-delete: a deleted expense keeps its row (NULL = live). Lets deletes be undone and
  // ensures nothing is ever truly lost. Existing rows stay NULL, so all totals are unchanged.
  ensureColumn('expenses', 'deleted_at', 'TEXT')
  // A "SIP" can be a monthly plan or a one-time lumpsum. Existing rows default to MONTHLY so
  // nothing about your current SIPs changes.
  ensureColumn('investments', 'sip_mode', "TEXT DEFAULT 'MONTHLY'")   // 'MONTHLY' | 'LUMPSUM'
  ensureColumn('investments', 'maturity_date', 'TEXT')                // bonds / FD maturity
  // Short-term bonds are usually quoted per MONTH, longer instruments per year. Existing
  // rows default to YEARLY so every rate already entered keeps its current meaning.
  ensureColumn('investments', 'rate_period', "TEXT DEFAULT 'YEARLY'")  // 'YEARLY' | 'MONTHLY'
  ensureColumn('salary_allocations', 'investment_percentage', 'REAL DEFAULT 0')
  ensureColumn('salary_allocations', 'investment_amount', 'REAL')
  // Bills now double as the "Subscriptions & Bills" list, incl. fixed monthly commitments.
  ensureColumn('bills', 'monthly', 'INTEGER DEFAULT 0')
  ensureColumn('bills', 'due_day', 'INTEGER')
  // Selling: cost basis and units already sold (partial sells), and equity vs debt fund (tax).
  ensureColumn('investments', 'sold_cost', 'REAL DEFAULT 0')
  ensureColumn('investments', 'sold_units', 'REAL DEFAULT 0')
  ensureColumn('investments', 'fund_category', "TEXT DEFAULT 'EQUITY'")   // 'EQUITY' | 'DEBT'
  // Renamed the MUTUAL_FUND investment type to SIP — migrate existing rows in place.
  db.prepare("UPDATE investments SET type='SIP' WHERE type='MUTUAL_FUND'").run()
  // Renamed GOLD -> METALS (now covers gold/silver/other) — migrate existing rows in place.
  db.prepare("UPDATE investments SET type='METALS' WHERE type='GOLD'").run()

  // One-time: the manual "recurring expenses" list is retired in favour of tagging expenses
  // as recurring. Per the user's choice, move any existing recurring items into Bills so the
  // data isn't lost, then clear the old list. Guarded so it only runs once.
  const moved = db.prepare("SELECT value FROM app_settings WHERE key='recurring_moved_to_bills'").get()
  if (!moved) {
    const recs = db.prepare('SELECT * FROM recurring_expenses').all()
    const typeMap = { Rent:'RENT', EMI:'EMI', Insurance:'INSURANCE', Subscription:'SUBSCRIPTION', Utilities:'UTILITY', Bills:'OTHER', Grocery:'OTHER', Maid:'OTHER', Cook:'OTHER', Other:'OTHER' }
    const today = new Date().toISOString().split('T')[0]
    const ins = db.prepare(`INSERT INTO bills (title, type, amount, date, notes, monthly, due_day) VALUES (?,?,?,?,?,1,?)`)
    const tx = db.transaction(() => {
      for (const r of recs) {
        const note = [r.notes, (r.category && !typeMap[r.category]) ? `(${r.category})` : null].filter(Boolean).join(' ')
        ins.run(r.title, typeMap[r.category] || 'OTHER', r.amount, today, note || null, r.due_day || null)
      }
      db.prepare('DELETE FROM recurring_expenses').run()
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('recurring_moved_to_bills','1')").run()
    })
    tx()
  }
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS salary_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_salary REAL NOT NULL,
      needs_percentage REAL DEFAULT 50,
      wants_percentage REAL DEFAULT 30,
      savings_percentage REAL DEFAULT 20,
      investment_percentage REAL DEFAULT 0,
      needs_amount REAL,
      wants_amount REAL,
      savings_amount REAL,
      investment_amount REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      category_name TEXT,
      date TEXT NOT NULL,
      notes TEXT,
      payment_method TEXT DEFAULT 'UPI',
      salary_allocation_id INTEGER,
      is_recurring INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS savings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      monthly_contribution REAL DEFAULT 0,
      deadline TEXT,
      status TEXT DEFAULT 'ACTIVE',
      achieved INTEGER DEFAULT 0,
      achieved_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Manual additions to the savings balance: prior/opening savings and extra pay/bonus.
    CREATE TABLE IF NOT EXISTS savings_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      type TEXT DEFAULT 'EXTRA',
      note TEXT,
      date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saving_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saving_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (saving_id) REFERENCES savings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      invested_amount REAL NOT NULL,
      current_value REAL,
      units REAL,
      purchase_price REAL,
      current_price REAL,
      interest_rate REAL,
      sip_amount REAL,
      sip_end TEXT,
      sip_gain_pct REAL,
      last_traded_date TEXT,
      auto_amount REAL,
      auto_day INTEGER,
      sort_order INTEGER,
      platform TEXT,
      date TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Individual buy lots for a STOCKS holding (to average the buy price across purchases).
    CREATE TABLE IF NOT EXISTS stock_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      units REAL NOT NULL,
      price REAL NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS emergency_fund (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      monthly_contribution REAL DEFAULT 0,
      monthly_expenses REAL,
      months_covered INTEGER DEFAULT 6,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank TEXT,
      account_number TEXT,
      balance REAL DEFAULT 0,
      purpose TEXT DEFAULT 'OTHER',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Free-form notes about money (ideas, goals, reminders). note_date is the day it was written.
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      body TEXT,
      tag TEXT DEFAULT 'GENERAL',
      pinned INTEGER DEFAULT 0,
      note_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Bills (credit card, phone recharge, subscriptions). Tracked separately and NOT
    -- included in any other totals or budget calculations.
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'OTHER',
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Generic key/value settings (used for the app password hash).
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Money lent out (to receive) and money borrowed (to repay).
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,            -- 'LEND' = I lent it out, 'DEBT' = I borrowed it
      person TEXT NOT NULL,
      amount REAL DEFAULT 0,
      date TEXT NOT NULL,           -- date of lending / date taken
      return_date TEXT,
      reason TEXT,
      settled INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Monthly contribution log for auto-investments (SIP info + PF/PPF contributions).
    CREATE TABLE IF NOT EXISTS contribution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount REAL DEFAULT 0,
      applied INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(investment_id, month, year)
    );

    -- Acknowledged reminders (recurring payments per month, bills once) so they stop nagging.
    CREATE TABLE IF NOT EXISTS reminder_ack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(kind, ref_id, period)
    );

    -- Fixed recurring expenses (rent, EMI, grocery, maid, cook, bills, etc.).
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'OTHER',
      amount REAL NOT NULL,
      due_day INTEGER,
      active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- One row per recurring item per month once it's been marked paid (links to the
    -- expense it created so it can be undone). Lets us show paid/unpaid status.
    CREATE TABLE IF NOT EXISTS recurring_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recurring_id INTEGER NOT NULL,
      period TEXT NOT NULL,       -- 'YYYY-MM'
      expense_id INTEGER,
      amount REAL,
      paid_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(recurring_id, period)
    );

    -- Monthly net-worth snapshots so we can chart growth over time.
    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ym TEXT UNIQUE,             -- 'YYYY-MM'
      date TEXT,
      net_worth REAL,
      bank REAL, investments REAL, emergency REAL, savings REAL, receivable REAL, debt REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Credit cards. Card spending is tracked here and is deliberately kept OUT of the
    -- monthly expense budget / turnover; it only moves the card's outstanding balance.
    CREATE TABLE IF NOT EXISTS credit_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank TEXT,
      last4 TEXT,
      credit_limit REAL DEFAULT 0,
      billing_day INTEGER,
      due_day INTEGER,
      notes TEXT,
      sort_order INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Monthly NAV + units snapshots for a SIP (so P&L is based on real market value).
    CREATE TABLE IF NOT EXISTS sip_nav (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      ym TEXT NOT NULL,          -- 'YYYY-MM'
      nav REAL,
      units REAL,
      date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(investment_id, ym),
      FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE
    );

    -- Card entries: SPEND raises the outstanding balance, PAYMENT reduces it.
    CREATE TABLE IF NOT EXISTS card_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      title TEXT,
      amount REAL NOT NULL,
      category TEXT,
      type TEXT DEFAULT 'SPEND',   -- 'SPEND' | 'PAYMENT'
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
    );

    -- Money moved into a demat / broker account. It is STILL your money until you actually
    -- buy something, so while invested=0 it counts as savings (uninvested broker cash).
    -- Marking it invested moves that amount out of savings and into an investment.
    CREATE TABLE IF NOT EXISTS demat_funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      broker TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      invested INTEGER DEFAULT 0,
      investment_id INTEGER,        -- set when marked invested (so it can be undone)
      source_account_id INTEGER,    -- bank account it was transferred from, if any
      notes TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Bank statement: one row for EVERY change to an account balance (manual add/withdraw,
    -- expenses, savings, demat, loan settlements, investment sale proceeds...).
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      type TEXT NOT NULL,             -- 'CREDIT' | 'DEBIT'
      amount REAL NOT NULL,           -- always positive
      balance_after REAL,
      source TEXT DEFAULT 'MANUAL',   -- MANUAL | OPENING | ADJUSTMENT | EXPENSE | SAVINGS | DEMAT | LOAN | SIP | INVESTMENT_SALE
      ref_type TEXT,
      ref_id INTEGER,
      note TEXT,
      date TEXT NOT NULL,             -- 'YYYY-MM-DD' (local)
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON bank_transactions(account_id, date);

    -- Realised sales of stocks / fund units. Kept separate from the live portfolio.
    -- snapshot_json holds the holding (and its lots) before the sale so it can be undone.
    CREATE TABLE IF NOT EXISTS investment_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER,
      title TEXT,
      type TEXT,
      category TEXT DEFAULT 'EQUITY', -- 'EQUITY' | 'DEBT' (tax treatment)
      slab_rate REAL,
      units REAL,
      sell_price REAL,
      sell_date TEXT NOT NULL,
      first_buy_date TEXT,
      last_buy_date TEXT,
      avg_holding_days INTEGER,
      gross REAL,
      brokerage REAL DEFAULT 0,
      stt REAL DEFAULT 0,
      net_proceeds REAL,
      cost_basis REAL,
      gain REAL,
      st_gain REAL,
      lt_gain REAL,
      est_tax REAL,
      account_id INTEGER,
      bank_txn_id INTEGER,
      chunks_json TEXT,
      snapshot_json TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
}

function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

// Close the handle so the file can be safely replaced (used by Restore).
function closeDatabase() {
  try { if (db) { db.pragma('wal_checkpoint(TRUNCATE)'); db.close() } } catch {}
  db = null
}

module.exports = { initDatabase, getDb, refreshSipValues, closeDatabase, getDbPath }
