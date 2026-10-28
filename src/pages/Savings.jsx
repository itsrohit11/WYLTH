import { useEffect, useState } from 'react'
import { useSavingStore } from '../stores/savingStore'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, INVESTMENT_TYPES } from '../lib/utils'
import { Plus, Pencil, Trash2, PiggyBank, PlusCircle, Wallet, CheckCircle, AlertCircle, ChevronRight, TrendingUp, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { UpdatedAt } from '../components/ui/UpdatedAt'

const statusVariant = { ACTIVE:'success', PAUSED:'warning', COMPLETED:'info' }

function SavingForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    title:initial.title, description:initial.description||'', target_amount:initial.target_amount,
    current_amount:initial.current_amount, monthly_contribution:initial.monthly_contribution,
    deadline:initial.deadline||'', status:initial.status, notes:initial.notes||''
  } : { title:'', description:'', target_amount:'', current_amount:0, monthly_contribution:'', deadline:'', status:'ACTIVE', notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Goal Title" value={f.title} onChange={e=>s('title',e.target.value)} placeholder="e.g. Buy a Car" required/>
      <Textarea label="Description" value={f.description} onChange={e=>s('description',e.target.value)} rows={2}/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Target Amount (₹)" type="number" value={f.target_amount} onChange={e=>s('target_amount',e.target.value)} required/>
        <Input label="Current Amount (₹)" type="number" value={f.current_amount} onChange={e=>s('current_amount',e.target.value)}/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Monthly Contribution (₹)" type="number" value={f.monthly_contribution} onChange={e=>s('monthly_contribution',e.target.value)}/>
        <Input label="Target Date" type="date" value={f.deadline} onChange={e=>s('deadline',e.target.value)}/>
      </div>
      <Select label="Status" value={f.status} onChange={e=>s('status',e.target.value)}>
        <option value="ACTIVE">Active</option>
        <option value="PAUSED">Paused</option>
        <option value="COMPLETED">Completed</option>
      </Select>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Create'} Goal</Button>
      </div>
    </form>
  )
}

function TxModal({ saving, onClose, onSave }) {
  const [f, setF] = useState({ amount:'', type:'DEPOSIT', date:new Date().toISOString().split('T')[0], notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); try { await onSave(saving.id,f.amount,f.type,f.date,f.notes); onClose() } catch {} }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        {['DEPOSIT','WITHDRAWAL'].map(t=>(
          <button key={t} type="button" onClick={()=>s('type',t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${f.type===t
              ? t==='DEPOSIT' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
              : 'border-line text-muted hover:bg-surface-2'}`}>
            {t==='DEPOSIT'?'+ Deposit':'- Withdraw'}
          </button>
        ))}
      </div>
      <Input label="Amount (₹)" type="number" value={f.amount} onChange={e=>s('amount',e.target.value)} required/>
      <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)}/>
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={f.type==='DEPOSIT'?'success':'danger'}>{f.type==='DEPOSIT'?'Add Deposit':'Record Withdrawal'}</Button>
      </div>
    </form>
  )
}

function AddMoneyForm({ onSave, onClose, account }) {
  const [f, setF] = useState({ type:'CREDIT', amount:'', note:'', date:new Date().toISOString().split('T')[0] })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const amt = Number(f.amount) || 0
  const submit=async(e)=>{ e.preventDefault(); await onSave(f.type==='DEBIT' ? -amt : amt, f.note, f.date); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        {[['CREDIT','+ Add money'],['DEBIT','− Withdraw']].map(([k,l])=>(
          <button key={k} type="button" onClick={()=>s('type',k)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${f.type===k
              ? k==='CREDIT' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
              : 'border-line text-muted hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-muted">{account ? <>Goes {f.type==='CREDIT' ? 'into' : 'out of'} <b className="text-content">{account.name}</b> (your Savings bank account, now {formatCurrency(account.balance)}), so the Bank tab matches.</> : 'Add a bank account marked Savings in the Bank tab first.'}</p>
      <Input label="Amount (₹)" type="number" value={f.amount} onChange={e=>s('amount',e.target.value)} required autoFocus/>
      <Input label="Note" value={f.note} onChange={e=>s('note',e.target.value)} placeholder={f.type==='CREDIT'?'e.g. Prior savings, Diwali bonus':'e.g. Withdrew for repair'}/>
      <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)}/>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={f.type==='CREDIT'?'success':'danger'}>{f.type==='CREDIT'?'Add to Savings':'Withdraw'}</Button>
      </div>
    </form>
  )
}

export default function Savings() {
  const { savings, loading, balance, fetchAll, fetchBalance, create, update, addTransaction, setAchieved, addMoney, delete:del } = useSavingStore()
  const [modal, setModal] = useState({open:false, item:null, type:'form'})
  const [showDone, setShowDone] = useState(false)

  useEffect(()=>{ fetchAll(); fetchBalance() },[])

  const totalTarget = savings.reduce((s,x)=>s+Number(x.target_amount),0)
  const totalCurrent = savings.reduce((s,x)=>s+Number(x.current_amount),0)
  const available = balance ? Number(balance.available) : null

  // A goal is "done" once it's purchased or explicitly marked COMPLETED.
  const isDone = (s) => !!s.achieved || s.status === 'COMPLETED'
  const activeGoals = savings.filter(s => !isDone(s))
  const doneGoals = savings.filter(isDone)

  const goalCard = (s) => {
    const isAchieved = !!s.achieved
    const affordable = available != null && available >= Number(s.target_amount)
    const cardCls = isDone(s)
      ? 'border-green-400 ring-1 ring-green-300 bg-green-50/60'
      : available==null ? '' : affordable ? 'border-green-300 ring-1 ring-green-200 bg-green-50/30' : 'border-red-200 ring-1 ring-red-100 bg-red-50/20'
    return (
      <Card key={s.id} className={cardCls}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div><h3 className="font-semibold text-content">{s.title}</h3>
              <Badge variant={statusVariant[s.status]||'default'}>{s.status}</Badge></div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:s,type:'tx'})}><PlusCircle size={16} className="text-green-600"/></Button>
              <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:s,type:'form'})}><Pencil size={14} className="text-muted"/></Button>
              <Button size="icon" variant="ghost" onClick={()=>del(s.id)}><Trash2 size={14} className="text-red-400"/></Button>
            </div>
          </div>
          {s.description && <p className="text-xs text-muted mb-3">{s.description}</p>}
          <div className="-mt-1 mb-3"><UpdatedAt at={s.updated_at}/></div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted">{formatCurrency(s.current_amount)}</span>
              <span className="font-medium text-content">{formatCurrency(s.target_amount)}</span>
            </div>
            <ProgressBar value={Number(s.current_amount)} max={Number(s.target_amount)} color={isDone(s)?'green':'blue'} showLabel/>
          </div>
          {isAchieved ? (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-green-800 bg-green-200 rounded-lg px-2.5 py-1.5">
              <CheckCircle size={13}/> Purchased{s.achieved_date?` · ${s.achieved_date}`:''}
              <button type="button" onClick={()=>setAchieved(s.id, false)} className="ml-auto text-green-700/70 hover:text-green-900 underline">undo</button>
            </div>
          ) : s.status==='COMPLETED' ? (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-green-800 bg-green-200 rounded-lg px-2.5 py-1.5">
              <CheckCircle size={13}/> Goal completed
            </div>
          ) : available != null && (
            affordable ? (
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-100 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-green-200 transition-colors">
                <input type="checkbox" checked={false} onChange={()=>setAchieved(s.id, true)} className="w-4 h-4 accent-green-600 rounded"/>
                You can buy this now — mark as purchased
              </label>
            ) : (
              <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-100 rounded-lg px-2.5 py-1.5">
                <AlertCircle size={13}/> Short by {formatCurrency(Number(s.target_amount) - available)}
              </div>
            )
          )}
          {(s.monthly_contribution > 0 || s.estimatedMonthsToComplete != null) && !isDone(s) && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-center">
              {s.monthly_contribution > 0 && <div className="bg-surface-2 rounded-lg p-2"><p className="font-semibold">{formatCurrency(s.monthly_contribution)}</p><p className="text-muted">Monthly</p></div>}
              {s.estimatedMonthsToComplete != null && <div className="bg-surface-2 rounded-lg p-2"><p className="font-semibold">{s.estimatedMonthsToComplete}m</p><p className="text-muted">To go</p></div>}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Savings Goals</h2>
          <p className="text-sm text-muted">You have <span className="font-semibold text-content">{formatCurrency(available != null ? available : totalCurrent)}</span> in savings</p></div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={()=>setModal({open:true,item:null,type:'money'})}><Wallet size={16}/> Add / Withdraw</Button>
          <Button onClick={()=>setModal({open:true,item:null,type:'form'})}><Plus size={16}/> New Goal</Button>
        </div>
      </div>

      {balance && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center"><Wallet className="text-brand-600" size={22}/></div>
              <div>
                <p className="text-xs text-muted">Available savings{Number(balance.dematCash)>0 ? ' — bank savings + uninvested demat cash' : ' — same as your Savings bank account'}</p>
                <p className={`text-2xl font-bold ${available>=0?'text-content':'text-red-600'}`}>{formatCurrency(available)}</p>
                {balance.account && (
                  <p className="text-xs text-muted mt-0.5">Mirrors <b className="text-content">{balance.account.name}</b> in the Bank tab · set aside for goals <b className="text-content tabular">{formatCurrency(balance.allocated)}</b> · free <b className={`tabular ${balance.free<0?'text-red-600':'text-content'}`}>{formatCurrency(balance.free)}</b></p>
                )}
                {Number(balance.dematCash) > 0 && (
                  <p className="text-xs text-muted mt-0.5">
                    Bank <b className="text-content tabular">{formatCurrency(balance.bankSavings)}</b>
                    <span className="mx-1.5 text-faint">+</span>
                    Demat (not invested) <b className="text-content tabular">{formatCurrency(balance.dematCash)}</b>
                  </p>
                )}
              </div>
            </div>
            {balance.hasAccount === false && (
              <p className="text-xs text-amber-600 mt-3">Add a bank account marked <b>Savings</b> (Bank tab) so this figure has somewhere to live — Add/Withdraw here will then sync with it.</p>
            )}
          </CardContent>
        </Card>
      )}

      <DematSection onChanged={fetchBalance}/>

      {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
      : savings.length===0 ? (
        <Card><CardContent className="text-center py-16">
          <PiggyBank size={48} className="mx-auto text-faint mb-3"/>
          <p className="text-muted mb-4">No savings goals yet</p>
          <Button onClick={()=>setModal({open:true,item:null,type:'form'})}><Plus size={16}/> Create First Goal</Button>
        </CardContent></Card>
      ) : (
        <>
          {activeGoals.length===0 ? (
            <Card><CardContent className="text-center py-10 text-muted text-sm">No active goals — everything you set is completed 🎉</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGoals.map(s=>goalCard(s))}
            </div>
          )}

          {/* Completed goals live in their own section below */}
          {doneGoals.length>0 && (
            <div className="pt-2">
              <button onClick={()=>setShowDone(o=>!o)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200 transition-colors">
                <CheckCircle size={14}/> Completed ({doneGoals.length})
                <ChevronRight size={14} className={`transition-transform ${showDone?'rotate-90':''}`}/>
              </button>
              {showDone && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {doneGoals.map(s=>goalCard(s))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={modal.open && modal.type==='form'} onClose={()=>setModal({open:false,item:null,type:'form'})} title={modal.item?'Edit Goal':'New Savings Goal'}>
        <SavingForm initial={modal.item} onSave={async(d)=>{ if(modal.item) await update(modal.item.id,d); else await create(d) }} onClose={()=>setModal({open:false,item:null,type:'form'})}/>
      </Modal>
      <Modal open={modal.open && modal.type==='tx'} onClose={()=>setModal({open:false,item:null,type:'tx'})} title={`Add Transaction — ${modal.item?.title}`} size="sm">
        <TxModal saving={modal.item} onSave={addTransaction} onClose={()=>setModal({open:false,item:null,type:'tx'})}/>
      </Modal>
      <Modal open={modal.open && modal.type==='money'} onClose={()=>setModal({open:false,item:null,type:'money'})} title="Add / Withdraw Savings" size="sm">
        <AddMoneyForm account={balance?.account} onSave={addMoney} onClose={()=>setModal({open:false,item:null,type:'money'})}/>
      </Modal>
    </div>
  )
}

// ---- Demat / broker cash -------------------------------------------------------------------
// Money moved to a broker isn't spent — it's still yours until you actually buy something.
// So it counts as savings while "not invested", and only becomes an investment when you say so.
const todayISO = () => new Date().toISOString().split('T')[0]

function DematAddForm({ accounts, onSave, onClose }) {
  const [f, setF] = useState({ broker:'', amount:'', date:todayISO(), source_account_id:'', notes:'' })
  const s = (k,v) => setF(p=>({...p,[k]:v}))
  return (
    <form onSubmit={e=>{ e.preventDefault(); onSave({ ...f, amount:parseFloat(f.amount)||0 }); onClose() }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Broker" value={f.broker} onChange={e=>s('broker',e.target.value)} placeholder="e.g. Zerodha, Groww" autoFocus/>
        <Input label="Amount (₹)" type="number" step="0.01" value={f.amount} onChange={e=>s('amount',e.target.value)} required/>
      </div>
      <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)}/>
      <Select label="Transferred from (optional)" value={f.source_account_id} onChange={e=>s('source_account_id',e.target.value)}>
        <option value="">Don't deduct from any account</option>
        {accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.bank?` — ${a.bank}`:''}</option>)}
      </Select>
      <p className="text-[11px] text-muted -mt-2">
        Pick the account the money came from and it'll be deducted there. If that's your Savings account your
        savings total won't change — the money just moved from the bank into your demat.
      </p>
      <Input label="Note" value={f.notes} onChange={e=>s('notes',e.target.value)} placeholder="optional"/>
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit">Add to Demat</Button>
      </div>
    </form>
  )
}

function MarkInvestedForm({ fund, onSave, onClose }) {
  const [invs, setInvs] = useState([])
  const [mode, setMode] = useState('new')          // 'new' | 'existing'
  const [pick, setPick] = useState('')
  const [f, setF] = useState({ title:'', type:'STOCKS' })
  useEffect(()=>{ window.api.investment.getAll().then(r=>{
    const active = (r||[]).filter(i=>i.status!=='CLOSED'); setInvs(active)
    if (active.length) { setMode('existing'); setPick(String(active[0].id)) }
  }).catch(()=>{}) }, [])
  const submit = (e) => {
    e.preventDefault()
    if (mode==='existing' && pick) onSave({ id:fund.id, investment_id:Number(pick) })
    else onSave({ id:fund.id, newInvestment:{ title:f.title || `${fund.broker||'Demat'} investment`, type:f.type, platform:fund.broker, date:fund.date } })
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="p-3 rounded-lg bg-surface-2 text-sm">
        Investing <b className="text-content">{formatCurrency(fund.amount)}</b>{fund.broker?<> from <b className="text-content">{fund.broker}</b></>:null}.
        <span className="text-muted"> This moves out of savings and into your investments.</span>
      </div>
      {invs.length>0 && (
        <div className="flex gap-2">
          <button type="button" onClick={()=>setMode('existing')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode==='existing'?'bg-brand-600 text-white':'bg-surface-2 text-muted hover:text-content'}`}>Add to existing</button>
          <button type="button" onClick={()=>setMode('new')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode==='new'?'bg-brand-600 text-white':'bg-surface-2 text-muted hover:text-content'}`}>Create new</button>
        </div>
      )}
      {mode==='existing' && invs.length>0 ? (
        <Select label="Which investment?" value={pick} onChange={e=>setPick(e.target.value)}>
          {invs.map(i=><option key={i.id} value={i.id}>{i.title} — {formatCurrency(i.invested_amount)}</option>)}
        </Select>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={f.title} onChange={e=>setF(p=>({...p,title:e.target.value}))} placeholder={`${fund.broker||'Demat'} investment`}/>
          <Select label="Type" value={f.type} onChange={e=>setF(p=>({...p,type:e.target.value}))}>
            {INVESTMENT_TYPES.map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
          </Select>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit">Mark Invested</Button>
      </div>
    </form>
  )
}

function DematSection({ onChanged }) {
  const [rows, setRows] = useState([])
  const [sum, setSum] = useState({ uninvested:0, invested:0, total:0 })
  const [accounts, setAccounts] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [investFor, setInvestFor] = useState(null)
  const [open, setOpen] = useState(true)

  const load = async () => {
    const [r, s] = await Promise.all([window.api.demat.getAll(), window.api.demat.summary()])
    setRows(r || []); setSum(s || { uninvested:0, invested:0, total:0 })
  }
  useEffect(()=>{ load(); window.api.bank.getAll().then(a=>setAccounts(a||[])).catch(()=>{}) }, [])
  const refresh = () => { load(); onChanged?.() }

  const add = async (d) => { await window.api.demat.add(d); toast.success('Added to demat — counted in your savings'); refresh() }
  const mark = async (p) => { await window.api.demat.markInvested(p); toast.success('Marked invested — moved into Investments'); refresh() }
  const unmark = async (id) => { await window.api.demat.unmarkInvested(id); toast.success('Moved back to uninvested cash'); refresh() }
  const remove = async (id) => { await window.api.demat.delete(id); toast.success('Removed'); refresh() }

  if (rows.length===0 && sum.total===0) {
    return (
      <>
        <Card>
          <CardContent className="py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><TrendingUp className="text-indigo-600" size={18}/></div>
              <div>
                <p className="text-sm font-semibold text-content">Demat / Broker cash</p>
                <p className="text-xs text-muted">Money you move to a broker stays in savings until you mark it invested.</p>
              </div>
            </div>
            <Button variant="secondary" onClick={()=>setAddOpen(true)}><Plus size={16}/> Add money to Demat</Button>
          </CardContent>
        </Card>
        <Modal open={addOpen} onClose={()=>setAddOpen(false)} title="Add money to Demat" size="sm">
          <DematAddForm accounts={accounts} onSave={add} onClose={()=>setAddOpen(false)}/>
        </Modal>
      </>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-4 flex-wrap gap-3">
          <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-3 text-left">
            <ChevronRight size={18} className={`text-faint transition-transform ${open?'rotate-90':''}`}/>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><TrendingUp className="text-indigo-600" size={18}/></div>
            <div>
              <p className="text-sm font-semibold text-content">Demat / Broker cash</p>
              <p className="text-xs">
                <span className="text-faint">Not invested</span> <b className="text-brand-600 tabular">{formatCurrency(sum.uninvested)}</b>
                <span className="mx-1.5 text-faint">·</span>
                <span className="text-faint">Invested</span> <b className="text-indigo-600 tabular">{formatCurrency(sum.invested)}</b>
              </p>
            </div>
          </button>
          <Button variant="secondary" size="sm" onClick={()=>setAddOpen(true)}><Plus size={15}/> Add money</Button>
        </div>

        {open && (
          <div className="border-t border-line">
            <p className="px-4 py-2 text-[11px] text-muted">
              Uninvested cash counts in your savings above. Marking it invested moves it into Investments —
              your net worth doesn't change either way.
            </p>
            {rows.map(f=>(
              <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line/60 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-content">{f.broker || 'Demat'}</span>
                    {f.invested
                      ? <Badge variant="info">Invested</Badge>
                      : <Badge variant="success">In savings</Badge>}
                  </div>
                  <p className="text-[11px] text-faint">{f.date}{f.notes?` · ${f.notes}`:''}</p>
                  <UpdatedAt at={f.updated_at}/>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-semibold tabular ${f.invested?'text-indigo-600':'text-content'}`}>{formatCurrency(f.amount)}</span>
                  {f.invested ? (
                    <Button size="sm" variant="ghost" onClick={()=>unmark(f.id)} title="Move back to uninvested cash"><RotateCcw size={13}/> Undo</Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={()=>setInvestFor(f)}>Mark invested</Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={()=>remove(f.id)}><Trash2 size={13} className="text-red-400"/></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Modal open={addOpen} onClose={()=>setAddOpen(false)} title="Add money to Demat" size="sm">
        <DematAddForm accounts={accounts} onSave={add} onClose={()=>setAddOpen(false)}/>
      </Modal>
      {investFor && (
        <Modal open onClose={()=>setInvestFor(null)} title="Mark as invested" size="sm">
          <MarkInvestedForm fund={investFor} onSave={mark} onClose={()=>setInvestFor(null)}/>
        </Modal>
      )}
    </Card>
  )
}
