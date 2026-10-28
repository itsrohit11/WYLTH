import { useEffect, useState } from 'react'
import { useEmergencyStore } from '../stores/emergencyStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, localToday } from '../lib/utils'
import { Shield, Plus, Settings, AlertTriangle } from 'lucide-react'
import { UpdatedAt } from '../components/ui/UpdatedAt'

function FundSetupForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    target_amount: initial.target_amount,
    monthly_expenses: initial.monthly_expenses,
    months_covered: initial.months_covered || 6,
    notes: initial.notes || ''
  } : { target_amount:'', monthly_expenses:'', months_covered:6, notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const autoTarget = f.monthly_expenses && f.months_covered ? f.monthly_expenses * f.months_covered : ''
  const submit=async(e)=>{
    e.preventDefault()
    const data = {...f, target_amount: f.target_amount || autoTarget}
    await onSave(data); onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Monthly Expenses (₹)" type="number" value={f.monthly_expenses} onChange={e=>s('monthly_expenses',Number(e.target.value))}/>
        <Input label="Months Target" type="number" value={f.months_covered} onChange={e=>s('months_covered',Number(e.target.value))} min={1} max={24}/>
      </div>
      {autoTarget && <p className="text-sm text-brand-600 font-medium">Suggested Target: {formatCurrency(autoTarget)}</p>}
      <Input label="Target Amount (₹)" type="number" value={f.target_amount||autoTarget} onChange={e=>s('target_amount',Number(e.target.value))} placeholder="Override target" required/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Setup'} Fund</Button>
      </div>
    </form>
  )
}

function ContributeForm({ current, fund, onSave, onClose }) {
  const [type, setType] = useState('CREDIT')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(localToday())
  const amt = Number(amount) || 0
  const after = type === 'CREDIT' ? Number(current||0) + amt : Number(current||0) - amt
  const submit=async(e)=>{ e.preventDefault(); try { await onSave(type === 'DEBIT' ? -amt : amt, note, date); onClose() } catch {} }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        {[['CREDIT','+ Add money'],['DEBIT','− Withdraw']].map(([k,l])=>(
          <button key={k} type="button" onClick={()=>setType(k)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${type===k
              ? k==='CREDIT' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
              : 'border-line text-muted hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>
      {fund?.linked
        ? <p className="text-xs text-muted">Moves money in <b className="text-content">{fund.account.name}</b> (your Emergency bank account) — it also shows on that account's statement.</p>
        : <p className="text-xs text-amber-700">No bank account is marked <b>Emergency</b> yet, so this only changes the fund figure. Link one in the Bank tab to keep them matched.</p>}
      <Input label="Amount (₹)" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="e.g. 5000" required autoFocus/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Monthly top-up"/>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </div>
      {amt>0 && <p className="text-xs text-muted">Fund will be <b className={after<0?'text-red-600':'text-content'}>{formatCurrency(after)}</b></p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={type==='CREDIT'?'success':'danger'}>{type==='CREDIT'?'Add':'Withdraw'}</Button>
      </div>
    </form>
  )
}

export default function EmergencyFund() {
  const { fund, loading, fetch, save, addContribution } = useEmergencyStore()
  const [modal, setModal] = useState({open:false,type:'setup'})

  useEffect(()=>{ fetch() },[])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>

  if (!fund) return (
    <div className="text-center py-20 text-muted">
      <Shield size={48} className="mx-auto mb-4 text-faint"/>
      <h2 className="text-xl font-semibold text-content mb-2">Setup Emergency Fund</h2>
      <p className="text-sm mb-6">Build a safety net of 3-6 months of expenses</p>
      <Button onClick={()=>setModal({open:true,type:'setup'})}><Plus size={16}/> Setup Fund</Button>
      <Modal open={modal.open} onClose={()=>setModal({open:false,type:'setup'})} title="Setup Emergency Fund">
        <FundSetupForm initial={null} onSave={save} onClose={()=>{ setModal({open:false,type:'setup'}); fetch() }}/>
      </Modal>
    </div>
  )

  const pct = fund.completionPercentage || 0
  const statusColor = pct >= 100 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Emergency Fund</h2>
          <p className="text-sm text-muted">3-6 months safety net</p>
          <UpdatedAt at={fund.updated_at}/>
          {fund.linked
            ? <p className="text-xs text-green-700 mt-1">Linked to <b>{fund.accounts.map(a=>a.name).join(' + ')}</b> — the balance always matches your Bank tab.</p>
            : <p className="text-xs text-amber-700 mt-1">Not linked to a bank account. In the Bank tab, set an account's purpose to <b>Emergency</b> and this balance will follow it automatically.</p>}</div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={()=>setModal({open:true,type:'contribute'})}><Plus size={16}/> Add / Withdraw</Button>
          <Button variant="outline" onClick={()=>setModal({open:true,type:'setup'})}><Settings size={16}/></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Fund Progress</CardTitle></CardHeader>
          <CardContent>
            <div className="text-center mb-6">
              <p className={`text-5xl font-bold ${statusColor}`}>{pct.toFixed(0)}%</p>
              <p className="text-sm text-muted mt-1">of target reached</p>
            </div>
            <ProgressBar value={Number(fund.current_amount)} max={Number(fund.target_amount)} color={pct>=100?'green':pct>=50?'yellow':'red'} showLabel size="lg"/>
            <div className="grid grid-cols-2 gap-4 mt-6 text-center">
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-green-700">{formatCurrency(fund.current_amount)}</p>
                <p className="text-xs text-green-600 mt-1">Current Balance</p>
              </div>
              <div className="bg-brand-50 rounded-xl p-4">
                <p className="text-2xl font-bold text-brand-700">{formatCurrency(fund.target_amount)}</p>
                <p className="text-xs text-brand-600 mt-1">Target Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="py-4 space-y-3">
              {[
                { label:'Still Needed', value: formatCurrency(fund.remainingAmount||0), cls:'text-orange-600' },
                { label:'Monthly Expenses', value: formatCurrency(fund.monthly_expenses||0), cls:'text-content' },
                { label:'Months Covered', value: `${Number(fund.actualMonthsCovered||0).toFixed(1)} months`, cls:'text-brand-700' },
                { label:'Target (months)', value: `${fund.months_covered||6} months`, cls:'text-content' },
              ].map(r=>(
                <div key={r.label} className="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0">
                  <span className="text-sm text-muted">{r.label}</span>
                  <span className={`text-sm font-semibold ${r.cls}`}>{r.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {pct < 100 && fund.remainingAmount > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="py-4">
                <div className="flex gap-2">
                  <AlertTriangle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-semibold text-yellow-800">Fund Incomplete</p>
                    <p className="text-xs text-yellow-700 mt-1">You need {formatCurrency(fund.remainingAmount)} more to reach your target.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {pct >= 100 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex gap-2">
                  <Shield size={16} className="text-green-600 mt-0.5"/>
                  <div>
                    <p className="text-sm font-semibold text-green-800">Fund Complete!</p>
                    <p className="text-xs text-green-700 mt-1">Your emergency fund covers {Number(fund.actualMonthsCovered||0).toFixed(1)} months.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Modal open={modal.open && modal.type==='setup'} onClose={()=>setModal({open:false,type:'setup'})} title="Update Emergency Fund">
        <FundSetupForm initial={fund} onSave={save} onClose={()=>{ setModal({open:false,type:'setup'}); fetch() }}/>
      </Modal>
      <Modal open={modal.open && modal.type==='contribute'} onClose={()=>setModal({open:false,type:'contribute'})} title="Add / Withdraw Funds" size="sm">
        <ContributeForm current={fund.current_amount} fund={fund} onSave={(amt,note,date)=>addContribution(fund.id,amt,note,date)} onClose={()=>setModal({open:false,type:'contribute'})}/>
      </Modal>
    </div>
  )
}
