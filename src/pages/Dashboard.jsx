import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Wallet, TrendingUp, Receipt, Shield, AlertCircle, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { StatCard } from '../components/ui/StatCard'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatPercent, catLabel, netLoanTotals } from '../lib/utils'
import { useChartTheme } from '../lib/theme'

const COLORS = ['#5B8CFF','#3DBE8B','#D6B875','#F59E0B','#A78BFA','#22D3EE','#F472B6','#94A3B8']

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ov, setOv] = useState(null)
  const [nw, setNw] = useState([])
  const chart = useChartTheme()

  useEffect(() => {
    window.api.analytics.dashboard()
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    Promise.all([
      window.api.bank.getAll(), window.api.bill.getAll(), window.api.loan.getAll(),
      window.api.saving.getBalance(), window.api.card.totals(),
    ]).then(([banks, bills, loans, sav, cards]) => {
      const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0)
      // Category totals are just the tally of the bank accounts assigned to each purpose.
      const byPurpose = (p) => banks.filter(b => b.purpose === p).reduce((s, b) => s + Number(b.balance || 0), 0)
      setOv({
        bank: sum(banks, 'balance'),
        bankSavings: byPurpose('SAVINGS'),
        bankEmergency: byPurpose('EMERGENCY'),
        bankInvestment: byPurpose('INVESTMENT'),
        bills: sum(bills, 'amount'),
        ...netLoanTotals(loans),
        monthlyBills: bills.filter(b => b.monthly).reduce((s, b) => s + Number(b.amount || 0), 0),
        savings: Number(sav.available || 0),
        cardOut: Number(cards?.outstanding || 0),
      })
    }).catch(() => {})
  }, [])

  useEffect(() => { window.api.networth.history().then(setNw).catch(() => setNw([])) }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"/></div>

  if (!data || !data.currentSalary) return (
    <div className="text-center py-20 text-muted">
      <AlertCircle size={44} className="mx-auto mb-3 text-faint"/>
      <p className="text-lg font-semibold">No data yet</p>
      <p className="text-sm mt-1 mb-4">Start by adding your monthly salary</p>
      <Link to="/salary" className="inline-flex items-center gap-1 text-brand-600 hover:underline text-sm font-medium">
        Add Salary <ArrowRight size={14}/>
      </Link>
    </div>
  )

  const gl = Number(data.totalGainLoss || 0)

  return (
    <div className="space-y-6 fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Monthly Salary" value={formatCurrency(data.currentSalary)}
          subtitle={format(new Date(),'MMMM yyyy')} icon={Wallet} color="blue"/>
        <StatCard title="Total Spent" value={formatCurrency(data.totalSpent)}
          subtitle={`${formatCurrency(data.remainingBudget)} left`} icon={Receipt} color="orange"/>
        <StatCard title="Portfolio Value" value={formatCurrency(data.totalCurrentValue)}
          subtitle={`${gl >= 0 ? '+' : ''}${formatCurrency(gl)} P&L`} icon={TrendingUp} color={gl >= 0 ? 'green' : 'red'}/>
        <StatCard title="Emergency Fund" value={formatCurrency(ov ? ov.bankEmergency : data.emergencyFundCurrent)}
          subtitle={Number(data.emergencyFundTarget) > 0 ? `${Math.round((ov ? ov.bankEmergency : 0) / Number(data.emergencyFundTarget) * 100)}% of target` : 'Emergency accounts'} icon={Shield} color="purple"/>
      </div>

      {/* Net worth + overview across sections */}
      {ov && (() => {
        // Emergency & Savings are categories WITHIN the bank total, so they're not added again.
        const netWorth = ov.bank + Number(data.totalCurrentValue||0) + ov.toReceive - ov.toRepay - Number(ov.cardOut||0)
        return (
          <>
            <Card className="ledger-margin hero-edge relative shadow-lift">
              <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(520px circle at 85% 0%, rgb(255 90 122 / 0.22), transparent 60%), radial-gradient(620px circle at 20% 120%, rgb(61 139 255 / 0.20), transparent 60%), radial-gradient(500px circle at 55% -20%, rgb(214 184 117 / 0.30), transparent 60%)'}}/>
              <CardContent className="pt-8 pb-7 pl-12 pr-8 flex items-end justify-between flex-wrap gap-6 relative">
                <div>
                  <p className="text-sm font-medium text-muted">Net worth today</p>
                  <p className="font-display text-[56px] leading-none font-semibold grad-num tabular mt-2 tracking-[-0.04em]">{formatCurrency(netWorth)}</p>
                  <p className="text-xs text-faint mt-3">Bank + investments + money owed to you, minus debts and card dues</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3">
                  {[
                    {l:'In banks', v:ov.bank, c:'#D6B875'},
                    {l:'Invested', v:data.totalCurrentValue, c:'#5B8CFF'},
                    {l:'Emergency', v:ov.bankEmergency, c:'#F59E0B'},
                    {l:'Savings', v:ov.bankSavings, c:'#45B58A'},
                  ].map(x=>(
                    <div key={x.l}>
                      <p className="flex items-center gap-1.5 text-xs text-muted"><span className="w-1.5 h-1.5 rounded-full" style={{background:x.c, boxShadow:`0 0 8px ${x.c}`}}/>{x.l}</p>
                      <p className="text-content font-semibold tabular text-lg mt-0.5">{formatCurrency(x.v)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                {l:'Card Outstanding', v:ov.cardOut, c:'text-red-600', to:'/cards'},
                {l:'To Receive', v:ov.toReceive, c:'text-green-600', to:'/loans'},
                {l:'To Repay', v:ov.toRepay, c:'text-red-600', to:'/loans'},
                {l:'Bills (total)', v:ov.bills, c:'text-orange-600', to:'/recurring'},
                {l:'Monthly bills', v:ov.monthlyBills, c:'text-brand-600', to:'/recurring'},
              ].map(c=>(
                <Link key={c.l} to={c.to}>
                  <Card className="transition-all duration-200 hover:shadow-lift hover:-translate-y-0.5">
                    <CardContent className="py-4 text-center">
                      <p className={`text-xl font-bold tabular ${c.c}`}>{formatCurrency(c.v)}</p>
                      <p className="text-xs text-muted mt-1">{c.l}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )
      })()}

      {/* Net worth trend */}
      {nw.length >= 2 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Net Worth Trend</CardTitle>
            <span className="text-xs text-muted">Last {nw.length} months</span>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={nw.map(s=>({ label:`${s.ym?.slice(5)}/${s.ym?.slice(2,4)}`, value:Number(s.net_worth)||0 }))}>
                <defs><linearGradient id="nwg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D6B875" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#D6B875" stopOpacity={0}/>
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid}/>
                <XAxis dataKey="label" tick={{fontSize:12, fill:chart.axis}}/>
                <YAxis tick={{fontSize:12, fill:chart.axis}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                <Tooltip contentStyle={chart.tooltip} formatter={v=>formatCurrency(v)}/>
                <Area type="monotone" dataKey="value" stroke="#D6B875" fill="url(#nwg)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Budget + Savings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>This Month's Budget</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label:'Recurring', spent: data.totalNeedsSpent, budget: data.needsBudget, color:'blue' },
              { label:'Personal', spent: data.totalWantsSpent, budget: data.wantsBudget, color:'orange' },
            ].map(({ label, spent, budget, color }) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-content">{label}</span>
                  <span className="text-muted">{formatCurrency(spent)} / {formatCurrency(budget)}</span>
                </div>
                <ProgressBar value={Number(spent||0)} max={Number(budget||1)}
                  color={Number(spent) > Number(budget) ? 'red' : color} showLabel/>
              </div>
            ))}
            <div className="pt-2 border-t border-line flex justify-between text-sm">
              <span className="text-muted font-medium">Savings Budget</span>
              <span className="font-semibold text-green-600">{formatCurrency(data.savingsBudget)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Savings & Investments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium text-content">Savings Goals</span>
                <span className="text-muted">{formatCurrency(data.totalSavingsCurrent)} / {formatCurrency(data.totalSavingsTarget)}</span>
              </div>
              <ProgressBar value={Number(data.totalSavingsCurrent||0)} max={Number(data.totalSavingsTarget||1)} color="green" showLabel/>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-line text-center">
              <div><p className="text-xl font-bold text-brand-600">{formatCurrency(data.totalInvested)}</p><p className="text-xs text-muted">Total Invested</p></div>
              <div><p className={`text-xl font-bold ${gl >= 0 ? 'text-green-600':'text-red-600'}`}>{gl >= 0 ? '+' : ''}{formatCurrency(gl)}</p><p className="text-xs text-muted">Unrealised P&L</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>6-Month Expense Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.monthlyExpensesTrend||[]}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D6B875" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#D6B875" stopOpacity={0}/>
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid}/>
                <XAxis dataKey="month" tick={{fontSize:12, fill:chart.axis}}/>
                <YAxis tick={{fontSize:12, fill:chart.axis}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                <Tooltip contentStyle={chart.tooltip} formatter={v=>formatCurrency(v)}/>
                <Area type="monotone" dataKey="amount" stroke="#D6B875" fill="url(#g)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>By Category</CardTitle></CardHeader>
          <CardContent>
            {data.expensesByCategory?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.expensesByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={45} outerRadius={85}>
                    {data.expensesByCategory.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={chart.tooltip} formatter={v=>formatCurrency(v)}/>
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-56 flex items-center justify-center text-faint text-sm">No data</div>}
          </CardContent>
        </Card>
      </div>

      {/* Recent */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Transactions</CardTitle>
          <Link to="/expenses" className="text-sm text-brand-600 hover:underline flex items-center gap-1">View all <ArrowRight size={14}/></Link>
        </CardHeader>
        <CardContent>
          {data.recentExpenses?.length > 0 ? (
            <div className="divide-y divide-line">
              {data.recentExpenses.map(e=>(
                <div key={e.id} className="flex justify-between items-center py-3">
                  <div><p className="text-sm font-medium text-content">{e.title}</p>
                    <p className="text-xs text-faint">{e.category_name||catLabel(e.category)} · {e.date}</p></div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(e.amount)}</p>
                    <Badge variant={e.category==='NEED'?'info':'warning'}>{catLabel(e.category)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-center py-8 text-faint text-sm">No transactions yet</p>}
        </CardContent>
      </Card>
    </div>
  )
}
