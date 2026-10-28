import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { formatCurrency } from '../lib/utils'
import RecurringOverview from './RecurringOverview'
import Bills from './Bills'

export default function RecurringAndBills() {
  const [tab, setTab] = useState('recurring')
  const [recurringTotal, setRecurringTotal] = useState(0)
  const [billsTotal, setBillsTotal] = useState(0)

  const refreshBills = useCallback(() => {
    window.api.bill.getAll().then(bs => setBillsTotal(bs.reduce((s, x) => s + Number(x.amount || 0), 0))).catch(() => {})
  }, [])
  useEffect(() => { refreshBills() }, [refreshBills])

  const combined = recurringTotal + billsTotal

  return (
    <div className="space-y-4">
      {/* Combined summary — recurring spend + subscriptions/bills, and the total */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-3 gap-4 text-center divide-x divide-line">
            <div>
              <p className="text-xl font-bold text-brand-600 tabular">{formatCurrency(recurringTotal)}</p>
              <p className="text-xs text-muted mt-1">Recurring Monthly Expenses</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600 tabular">{formatCurrency(billsTotal)}</p>
              <p className="text-xs text-muted mt-1">Subscriptions &amp; Bills</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-content tabular">{formatCurrency(combined)}</p>
              <p className="text-xs text-muted mt-1">Combined Total</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="py-3 flex gap-2 flex-wrap">
        {[['recurring', 'Recurring Monthly Expenses'], ['bills', 'Subscriptions & Bills']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${tab === k ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted hover:text-content'}`}>{l}</button>
        ))}
      </CardContent></Card>

      {tab === 'recurring' ? <RecurringOverview onTotal={setRecurringTotal} /> : <Bills onChange={refreshBills} />}
    </div>
  )
}
