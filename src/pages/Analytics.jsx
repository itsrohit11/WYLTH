import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { formatCurrency, MONTHS, netLoanTotals } from '../lib/utils'
import { useChartTheme } from '../lib/theme'

const COLORS = ['#5B8CFF','#3DBE8B','#D6B875','#F59E0B','#A78BFA','#22D3EE','#F472B6','#94A3B8']

const CY = new Date().getFullYear()

export default function Analytics() {
  const [data, setData] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [year, setYear] = useState(CY)
  const [loading, setLoading] = useState(true)
  const [ov, setOv] = useState(null)
  const chart = useChartTheme()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.api.analytics.dashboard(),
      window.api.analytics.monthly(year)
    ]).then(([d, m]) => { setData(d); setMonthly(m) }).catch(() => {}).finally(() => setLoading(false))
  }, [year])

  useEffect(() => {
    Promise.all([
      window.api.bank.getAll(), window.api.bill.getAll(), window.api.loan.getAll(),
      window.api.saving.getBalance(), window.api.card.totals(),
    ]).then(([banks, bills, loans, sav, cards]) => {
      const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0)
      const byPurpose = (p) => banks.filter(b => b.purpose === p).reduce((s, b) => s + Number(b.balance || 0), 0)
      setOv({
        bank: sum(banks, 'balance'),
        bankEmergency: byPurpose('EMERGENCY'),
        bankSavings: byPurpose('SAVINGS'),
        bills: sum(bills, 'amount'),
        ...netLoanTotals(loans),
        monthlyBills: bills.filter(b => b.monthly).reduce((s, b) => s + Number(b.amount || 0), 0),
        savings: Number(sav.available || 0),
        cardOut: Number(cards?.outstanding || 0),
      })
    }).catch(() => {})
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"/></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Analytics</h2>
          <p className="text-sm text-muted">Insights into your finances</p></div>
        <select value={year} onChange={e=>setYear(Number(e.target.value))}
          className="px-3 py-2 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500">
          {[CY-2,CY-1,CY,CY+1].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Overview across all sections */}
      {ov && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {l:'Bank (total)', v:ov.bank, c:'text-content'},
            {l:'Investments (current)', v:data?.totalCurrentValue||0, c:'text-brand-600'},
            {l:'Emergency (accounts)', v:ov.bankEmergency, c:'text-purple-600'},
            {l:'Savings available', v:ov.savings, c:'text-green-600'},
            {l:'To Receive', v:ov.toReceive, c:'text-green-600'},
            {l:'To Repay', v:ov.toRepay, c:'text-red-600'},
            {l:'Card Outstanding', v:ov.cardOut, c:'text-red-600'},
            {l:'Bills (total)', v:ov.bills, c:'text-orange-600'},
            {l:'Monthly bills', v:ov.monthlyBills, c:'text-content'},
          ].map(c=>(
            <Card key={c.l}><CardContent className="py-3 text-center">
              <p className={`text-lg font-bold ${c.c}`}>{formatCurrency(c.v)}</p>
              <p className="text-[11px] text-muted mt-0.5">{c.l}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Monthly Spending vs Salary */}
      <Card>
        <CardHeader><CardTitle>Monthly Spending vs Income — {year}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid}/>
              <XAxis dataKey="month" tickFormatter={m=>MONTHS[Number(m)-1]?.slice(0,3)} tick={{fontSize:12, fill:chart.axis}}/>
              <YAxis tick={{fontSize:12, fill:chart.axis}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
              <Tooltip cursor={{fill:'rgba(127,150,200,0.12)'}} contentStyle={chart.tooltip} formatter={v=>formatCurrency(v)}/>
              <Legend wrapperStyle={{fontSize:12,color:chart.axis}}/>
              <Bar dataKey="salary" name="Income" fill="#3DBE8B" radius={[3,3,0,0]}/>
              <Bar dataKey="total_expenses" name="Expenses" fill="#D6B875" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs vs Wants */}
        <Card>
          <CardHeader><CardTitle>Recurring vs Personal Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid}/>
                <XAxis dataKey="month" tickFormatter={m=>MONTHS[Number(m)-1]?.slice(0,3)} tick={{fontSize:12, fill:chart.axis}}/>
                <YAxis tick={{fontSize:12, fill:chart.axis}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                <Tooltip contentStyle={chart.tooltip} formatter={v=>formatCurrency(v)}/>
                <Legend wrapperStyle={{fontSize:12,color:chart.axis}}/>
                <Line type="monotone" dataKey="needs" name="Recurring" stroke="#5B8CFF" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="wants" name="Personal" stroke="#D6B875" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Investment Allocation */}
        <Card>
          <CardHeader><CardTitle>Investment Allocation</CardTitle></CardHeader>
          <CardContent>
            {data?.investmentAllocation?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.investmentAllocation} dataKey="value" nameKey="type"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {data.investmentAllocation.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={chart.tooltip} formatter={(v,n)=>[formatCurrency(v),n]}/>
                  <Legend wrapperStyle={{fontSize:12,color:chart.axis}}/>
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-56 flex items-center justify-center text-faint text-sm">No investments data</div>}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {data?.expensesByCategory?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Top Expense Categories (This Month)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.expensesByCategory.slice(0,8).map((c,i)=>(
                <div key={c.category} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{background:COLORS[i%COLORS.length]}}/>
                  <span className="text-sm text-content w-36 truncate">{c.category}</span>
                  <div className="flex-1 bg-surface-2 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{
                      width:`${Math.min(100,(c.amount/data.expensesByCategory[0].amount)*100)}%`,
                      background: COLORS[i%COLORS.length]
                    }}/>
                  </div>
                  <span className="text-sm font-semibold text-content w-24 text-right">{formatCurrency(c.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Savings Rate */}
      {monthly?.some(m=>m.savings_rate) && (
        <Card>
          <CardHeader><CardTitle>Savings Rate %</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid}/>
                <XAxis dataKey="month" tickFormatter={m=>MONTHS[Number(m)-1]?.slice(0,3)} tick={{fontSize:12, fill:chart.axis}}/>
                <YAxis tick={{fontSize:12, fill:chart.axis}} tickFormatter={v=>`${v}%`} domain={[0,100]}/>
                <Tooltip cursor={{fill:'rgba(127,150,200,0.12)'}} contentStyle={chart.tooltip} formatter={v=>`${Number(v).toFixed(1)}%`}/>
                <Bar dataKey="savings_rate" name="Savings Rate" fill="#3DBE8B" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
