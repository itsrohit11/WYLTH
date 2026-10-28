const { contextBridge, ipcRenderer } = require('electron')

// Expose all IPC channels to the renderer (React) securely
contextBridge.exposeInMainWorld('api', {
  // Salary
  salary: {
    getAll: () => ipcRenderer.invoke('salary:getAll'),
    getCurrent: () => ipcRenderer.invoke('salary:getCurrent'),
    create: (data) => ipcRenderer.invoke('salary:create', data),
    update: (id, data) => ipcRenderer.invoke('salary:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('salary:delete', id),
  },
  // Expenses
  expense: {
    getAll: (params) => ipcRenderer.invoke('expense:getAll', params),
    getRecent: () => ipcRenderer.invoke('expense:getRecent'),
    monthTotals: () => ipcRenderer.invoke('expense:monthTotals'),
    create: (data) => ipcRenderer.invoke('expense:create', data),
    update: (id, data) => ipcRenderer.invoke('expense:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('expense:delete', id),
    restore: (id) => ipcRenderer.invoke('expense:restore', id),
    trashList: () => ipcRenderer.invoke('expense:trashList'),
    purge: (id) => ipcRenderer.invoke('expense:purge', id),
    unsettled: () => ipcRenderer.invoke('expense:unsettled'),
    settleUnsettled: (ids, account_id) => ipcRenderer.invoke('expense:settleUnsettled', { ids, account_id }),
  },
  // Demat / broker cash — savings until you actually invest it
  demat: {
    getAll: () => ipcRenderer.invoke('demat:getAll'),
    summary: () => ipcRenderer.invoke('demat:summary'),
    add: (data) => ipcRenderer.invoke('demat:add', data),
    markInvested: (p) => ipcRenderer.invoke('demat:markInvested', p),
    unmarkInvested: (id) => ipcRenderer.invoke('demat:unmarkInvested', id),
    update: (id, data) => ipcRenderer.invoke('demat:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('demat:delete', id),
    restore: (id) => ipcRenderer.invoke('demat:restore', id),
    trashList: () => ipcRenderer.invoke('demat:trashList'),
  },
  // Savings
  saving: {
    getAll: () => ipcRenderer.invoke('saving:getAll'),
    getBalance: () => ipcRenderer.invoke('saving:getBalance'),
    create: (data) => ipcRenderer.invoke('saving:create', data),
    update: (id, data) => ipcRenderer.invoke('saving:update', { id, data }),
    addTransaction: (id, amount, type, date, notes) => ipcRenderer.invoke('saving:addTransaction', { id, amount, type, date, notes }),
    setAchieved: (id, achieved) => ipcRenderer.invoke('saving:setAchieved', { id, achieved }),
    getLedger: () => ipcRenderer.invoke('saving:getLedger'),
    addMoney: (amount, note, date) => ipcRenderer.invoke('saving:addMoney', { amount, note, date }),
    deleteMoney: (id) => ipcRenderer.invoke('saving:deleteMoney', id),
    delete: (id) => ipcRenderer.invoke('saving:delete', id),
  },
  // Investments
  investment: {
    getAll: (params) => ipcRenderer.invoke('investment:getAll', params),
    create: (data) => ipcRenderer.invoke('investment:create', data),
    update: (id, data) => ipcRenderer.invoke('investment:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('investment:delete', id),
    getStockPurchases: (investmentId) => ipcRenderer.invoke('investment:getStockPurchases', investmentId),
    addStockPurchase: (investment_id, units, price, date) => ipcRenderer.invoke('investment:addStockPurchase', { investment_id, units, price, date }),
    deleteStockPurchase: (id, investment_id) => ipcRenderer.invoke('investment:deleteStockPurchase', { id, investment_id }),
    updateStockPrice: (id, current_price) => ipcRenderer.invoke('investment:updateStockPrice', { id, current_price }),
    getNavHistory: (investmentId) => ipcRenderer.invoke('investment:getNavHistory', investmentId),
    saveNav: (data) => ipcRenderer.invoke('investment:saveNav', data),
  },
  meta: { lastUpdated: () => ipcRenderer.invoke('meta:lastUpdated') },
  note: {
    getAll: () => ipcRenderer.invoke('note:getAll'),
    create: (data) => ipcRenderer.invoke('note:create', data),
    update: (id, data) => ipcRenderer.invoke('note:update', { id, data }),
    pin: (id, pinned) => ipcRenderer.invoke('note:pin', { id, pinned }),
    delete: (id) => ipcRenderer.invoke('note:delete', id),
  },
  // Selling stocks / SIP units (realised gains, tax estimate, proceeds to a bank account)
  sale: {
    preview: (data) => ipcRenderer.invoke('sale:preview', data),
    execute: (data) => ipcRenderer.invoke('sale:execute', data),
    getAll: () => ipcRenderer.invoke('sale:getAll'),
    fySummary: () => ipcRenderer.invoke('sale:fySummary'),
    undo: (id) => ipcRenderer.invoke('sale:undo', id),
  },
  // Emergency Fund
  emergency: {
    get: () => ipcRenderer.invoke('emergency:get'),
    save: (data) => ipcRenderer.invoke('emergency:save', data),
    addContribution: (id, amount, note, date) => ipcRenderer.invoke('emergency:addContribution', { id, amount, note, date }),
  },
  // Analytics
  analytics: {
    dashboard: () => ipcRenderer.invoke('analytics:dashboard'),
    monthly: (year) => ipcRenderer.invoke('analytics:monthly', { year }),
  },
  // Export
  export: {
    excel: () => ipcRenderer.invoke('export:excel'),
    getDbPath: () => ipcRenderer.invoke('export:getDbPath'),
    openDbFolder: () => ipcRenderer.invoke('export:openDbFolder'),
  },
  // Backup
  backup: {
    now: () => ipcRenderer.invoke('backup:now'),
    list: () => ipcRenderer.invoke('backup:list'),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
  // Net-worth history
  networth: {
    current: () => ipcRenderer.invoke('networth:current'),
    history: () => ipcRenderer.invoke('networth:history'),
    snapshotNow: () => ipcRenderer.invoke('networth:snapshotNow'),
  },
  // Credit cards (spending kept separate from the expense budget)
  card: {
    getAll: () => ipcRenderer.invoke('card:getAll'),
    totals: () => ipcRenderer.invoke('card:totals'),
    create: (data) => ipcRenderer.invoke('card:create', data),
    update: (id, data) => ipcRenderer.invoke('card:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('card:delete', id),
    txns: (cardId) => ipcRenderer.invoke('card:txns', cardId),
    addTxn: (data) => ipcRenderer.invoke('card:addTxn', data),
    deleteTxn: (id, card_id) => ipcRenderer.invoke('card:deleteTxn', { id, card_id }),
    insights: (cardId) => ipcRenderer.invoke('card:insights', cardId),
  },
  // Bank accounts
  bank: {
    getAll: () => ipcRenderer.invoke('bank:getAll'),
    create: (data) => ipcRenderer.invoke('bank:create', data),
    update: (id, data) => ipcRenderer.invoke('bank:update', { id, data }),
    adjust: (id, amount, type, note, date) => ipcRenderer.invoke('bank:adjust', { id, amount, type, note, date }),
    statement: (id, ym) => ipcRenderer.invoke('bank:statement', { id, ym }),
    delete: (id) => ipcRenderer.invoke('bank:delete', id),
  },
  // Bills (separate, not part of any other totals)
  bill: {
    getAll: () => ipcRenderer.invoke('bill:getAll'),
    typeTotals: () => ipcRenderer.invoke('bill:typeTotals'),
    create: (data) => ipcRenderer.invoke('bill:create', data),
    update: (id, data) => ipcRenderer.invoke('bill:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('bill:delete', id),
  },
  // Lending & debts
  loan: {
    getAll: (kind) => ipcRenderer.invoke('loan:getAll', { kind }),
    create: (data) => ipcRenderer.invoke('loan:create', data),
    update: (id, data) => ipcRenderer.invoke('loan:update', { id, data }),
    setSettled: (id, settled, account_id) => ipcRenderer.invoke('loan:setSettled', { id, settled, account_id: account_id || null }),
    setLocked: (id, locked) => ipcRenderer.invoke('loan:setLocked', { id, locked }),
    delete: (id) => ipcRenderer.invoke('loan:delete', id),
    deletePerson: (person) => ipcRenderer.invoke('loan:deletePerson', { person }),
  },
  // Recurring expenses
  recurring: {
    getAll: () => ipcRenderer.invoke('recurring:getAll'),
    create: (data) => ipcRenderer.invoke('recurring:create', data),
    update: (id, data) => ipcRenderer.invoke('recurring:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('recurring:delete', id),
    paidStatus: () => ipcRenderer.invoke('recurring:paidStatus'),
    markPaid: (id, date, account_id) => ipcRenderer.invoke('recurring:markPaid', { id, date, account_id }),
    unmarkPaid: (id) => ipcRenderer.invoke('recurring:unmarkPaid', { id }),
  },
  // Monthly contribution notifications
  notification: {
    pending: () => ipcRenderer.invoke('notification:pending'),
    accept: (investment_id, month, year) => ipcRenderer.invoke('notification:accept', { investment_id, month, year }),
    skip: (investment_id, month, year) => ipcRenderer.invoke('notification:skip', { investment_id, month, year }),
    remindLater: (investment_id) => ipcRenderer.invoke('notification:remindLater', { investment_id }),
    ackReminder: (kind, ref_id, period) => ipcRenderer.invoke('notification:ackReminder', { kind, ref_id, period }),
    payBill: (kind, ref_id, period, account_id) => ipcRenderer.invoke('notification:payBill', { kind, ref_id, period, account_id }),
  },
  // Manual list ordering (drag to reorder)
  reorder: (table, ids) => ipcRenderer.invoke('reorder:set', { table, ids }),
  // App settings (spend warnings)
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  },
  // App password
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    setPassword: (password) => ipcRenderer.invoke('auth:setPassword', { password }),
    verify: (password) => ipcRenderer.invoke('auth:verify', { password }),
    resetWithCode: (code, newPassword) => ipcRenderer.invoke('auth:resetWithCode', { code, newPassword }),
  },
  platform: process.platform,
})
