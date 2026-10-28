import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...i) => twMerge(clsx(i))

export const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v || 0))

export const formatPercent = (n) => `${Number(n || 0).toFixed(1)}%`

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Internal category codes stay NEED/WANT (so existing data is untouched); these are
// just the display labels the user now sees.
export const CATEGORY_LABELS = { NEED: 'Recurring', WANT: 'Personal' }
export const catLabel = (c) => CATEGORY_LABELS[c] || c

export const EXPENSE_CATEGORIES = {
  NEED: ['Rent','EMI','Fuel','Transportation','Grocery','Bills','Education','Insurance','Healthcare','Utilities','Other'],
  WANT: ['Travel','Food','Grocery','Utilities','Shopping','Gifts','Hobbies','Personal Care','Other'],
}

export const INVESTMENT_TYPES = ['STOCKS','SIP','FD','BONDS','PPF','NPS','METALS','CRYPTO','REAL_ESTATE','OTHER']
export const PAYMENT_METHODS = ['CASH','UPI','CARD','BANK_TRANSFER','NETBANKING']

// Profit = green, loss = red, each on its own tinted chip so the two read apart at a glance.
export const classifyGL = (v) => Number(v) >= 0
  ? 'font-bold text-[#15803D] bg-[#22C55E]/15 ring-1 ring-[#22C55E]/45 dark:text-[#4ADE80] dark:bg-[#22C55E]/20 px-2 py-0.5 rounded-lg w-fit'
  : 'font-bold text-[#B91C1C] bg-[#EF4444]/12 ring-1 ring-[#EF4444]/45 dark:text-[#FF6B6B] dark:bg-[#EF4444]/20 px-2 py-0.5 rounded-lg w-fit'

// Google-Pay style netting: per person, unsettled lends offset unsettled debts, and only
// the final figure counts as "to receive" (net > 0) or "to repay" (net < 0).
export const netLoanTotals = (loans) => {
  const per = {}
  for (const l of loans || []) {
    if (l.settled) continue
    const k = (l.person || '').trim().toLowerCase()
    per[k] = (per[k] || 0) + (l.kind === 'LEND' ? 1 : -1) * Number(l.amount || 0)
  }
  let toReceive = 0, toRepay = 0
  for (const k in per) { const n = per[k]; if (n > 0) toReceive += n; else toRepay += -n }
  return { toReceive, toRepay }
}

// ---- dates & "last updated" -------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0')

// Today in LOCAL time as YYYY-MM-DD. (toISOString() is UTC and gives yesterday before 5:30 AM IST.)
export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

// SQLite's datetime('now') is UTC without a zone marker ('2026-10-27 15:04:05'); ISO strings
// from the app already carry one. Returns a Date, or null.
export const parseDbTime = (s) => {
  if (!s) return null
  const str = String(s)
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(str) ? str : str.replace(' ', 'T') + 'Z')
  return isNaN(d) ? null : d
}

export const fmtDateTime = (s) => {
  const d = parseDbTime(s)
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''
}

export const timeAgo = (s) => {
  const d = parseDbTime(s)
  if (!d) return ''
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (sec < 45) return 'just now'
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`
  if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`
  if (sec < 86400 * 30) return `${Math.round(sec / 86400)} day${Math.round(sec / 86400) === 1 ? '' : 's'} ago`
  return fmtDateTime(s)
}

// 'YYYY-MM-DD' -> '12 Mar 2026' (no timezone shifting)
export const fmtDate = (s) => {
  if (!s) return '—'
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y) return s
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtHolding = (days) => {
  const n = Number(days) || 0
  if (n < 31) return `${n} day${n === 1 ? '' : 's'}`
  const m = Math.floor(n / 30.4375)
  return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m} months`
}
