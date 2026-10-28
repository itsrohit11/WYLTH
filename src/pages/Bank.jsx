import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, localToday } from '../lib/utils'
import StatementModal from '../components/StatementModal'
import { UpdatedAt } from '../components/ui/UpdatedAt'
import { useDnd } from '../lib/useDnd'
import { Plus, Pencil, Trash2, Landmark, GripVertical, ArrowDownLeft, ArrowUpRight, ScrollText } from 'lucide-react'

const PURPOSES = ['SAVINGS', 'EXPENSE', 'INVESTMENT', 'EMERGENCY', 'OTHER']
const purposeLabel = { SAVINGS: 'Savings', EXPENSE: 'Expense', INVESTMENT: 'Investment', EMERGENCY: 'Emergency', OTHER: 'Other' }
const purposeColor = { SAVINGS: 'text-green-600', EXPENSE: 'text-orange-600', INVESTMENT: 'text-brand-600', EMERGENCY: 'text-red-600', OTHER: 'text-muted' }
const mask = (n) => n ? '•••• ' + String(n).slice(-4) : ''

function BankForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    name:initial.name, bank:initial.bank||'', account_number:initial.account_number||'',
    balance:initial.balance, purpose:initial.purpose||'OTHER', notes:initial.notes||''
  } : { name:'', bank:'', account_number:'', balance:'', purpose:'SAVINGS', notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Account Name / Nickname" value={f.name} onChange={e=>s('name',e.target.value)} placeholder="e.g. HDFC Salary A/c" required/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Bank" value={f.bank} onChange={e=>s('bank',e.target.value)} placeholder="e.g. HDFC Bank"/>
        <Input label="Account Number" value={f.account_number} onChange={e=>s('account_number',e.target.value)} placeholder="optional"/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Current Balance (₹)" type="number" step="any" value={f.balance} onChange={e=>s('balance',e.target.value)} required/>
        <Select label="Used for" value={f.purpose} onChange={e=>s('purpose',e.target.value)}>
          {PURPOSES.map(p=><option key={p} value={p}>{purposeLabel[p]}</option>)}
        </Select>
      </div>
      <p className="text-xs text-muted -mt-1">This is the money in the account. Each category (Savings, Expense…) totals the accounts you assign to it. Use <b>Add / Withdraw</b> on the card to credit or debit anytime.</p>
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Add'} Account</Button>
      </div>
    </form>
  )
}

// Credit (add) or debit (withdraw) money from an account.
function AdjustForm({ account, initialType, onSave, onClose }) {
  const [type, setType] = useState(initialType || 'CREDIT')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(localToday())
  const cur = Number(account.balance) || 0
  const amt = Number(amount) || 0
  const after = type === 'CREDIT' ? cur + amt : cur - amt
  const submit = async (e) => { e.preventDefault(); await onSave(account.id, amt, type, note.trim(), date); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted"><b className="text-content">{account.name}</b> · current balance {formatCurrency(cur)}</p>
      <div className="flex gap-3">
        {[['CREDIT','+ Add money'],['DEBIT','− Withdraw']].map(([k,l])=>(
          <button key={k} type="button" onClick={()=>setType(k)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${type===k
              ? k==='CREDIT' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
              : 'border-line text-muted hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>
      <Input label="Amount (₹)" type="number" step="any" value={amount} onChange={e=>setAmount(e.target.value)} required autoFocus/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Note (shows on statement)" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Salary credited, ATM withdrawal"/>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} required/>
      </div>
      {amt>0 && type==='CREDIT' && cur<0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800">
          This account is <b>overspent by {formatCurrency(-cur)}</b>. {amt >= -cur
            ? <>{formatCurrency(-cur)} of this covers the overspend; the remaining {formatCurrency(amt + cur)} is new balance.</>
            : <>this ₹{formatCurrency(amt)} reduces the overspend to {formatCurrency(-(cur + amt))}.</>}
        </div>
      )}
      {amt>0 && <p className="text-xs text-muted">New balance will be <b className={after<0?'text-red-600':'text-content'}>{formatCurrency(after)}</b></p>}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={type==='CREDIT'?'success':'danger'}>{type==='CREDIT'?'Add':'Withdraw'} {amt>0?formatCurrency(amt):''}</Button>
      </div>
    </form>
  )
}

export default function Bank() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open:false, item:null })
  const [adjust, setAdjust] = useState({ open:false, account:null })
  const [statementFor, setStatementFor] = useState(null)

  const load = () => { setLoading(true); window.api.bank.getAll().then(setAccounts).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() }, [])

  const liveOf = (a) => Number(a.balance) || 0
  const total = accounts.reduce((s,a)=>s+liveOf(a),0)
  const byPurpose = (p) => accounts.filter(a=>a.purpose===p).reduce((s,a)=>s+liveOf(a),0)
  const save = async (d) => { if (modal.item) await window.api.bank.update(modal.item.id, d); else await window.api.bank.create(d); load() }
  const del = async (id) => { await window.api.bank.delete(id); load() }
  const doAdjust = async (id, amount, type, note, date) => { await window.api.bank.adjust(id, amount, type, note, date); load() }
  const { itemProps } = useDnd(accounts, async (arr) => { setAccounts(arr); await window.api.reorder('bank_accounts', arr.map(a => a.id)) })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Bank Accounts</h2>
          <p className="text-sm text-muted">Each category totals the accounts you assign to it</p></div>
        <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add Account</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {label:'Total Balance', value:total, cls:'text-content'},
          {label:'Savings', value:byPurpose('SAVINGS'), cls:'text-green-600'},
          {label:'Expense', value:byPurpose('EXPENSE'), cls:'text-orange-600'},
          {label:'Investment', value:byPurpose('INVESTMENT'), cls:'text-brand-600'},
          {label:'Emergency', value:byPurpose('EMERGENCY'), cls:'text-red-600'},
        ].map(c=>(
          <Card key={c.label}><CardContent className="py-4 text-center">
            <p className={`text-xl font-bold ${c.cls}`}>{formatCurrency(c.value)}</p>
            <p className="text-xs text-muted mt-1">{c.label}</p>
          </CardContent></Card>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
      : accounts.length===0 ? (
        <Card><CardContent className="text-center py-16 text-faint"><Landmark size={40} className="mx-auto mb-3 text-faint"/><p>No bank accounts yet</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a, idx)=>(
            <div key={a.id} {...itemProps(idx)}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <GripVertical size={16} className="text-faint cursor-grab shrink-0"/>
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center"><Landmark className="text-brand-600" size={18}/></div>
                    <div>
                      <h3 className="font-semibold text-content leading-tight">{a.bank || a.name}</h3>
                      <p className={`text-xs font-semibold ${purposeColor[a.purpose]||'text-muted'}`}>{purposeLabel[a.purpose]||a.purpose}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:a})}><Pencil size={14} className="text-muted"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>del(a.id)}><Trash2 size={14} className="text-red-400"/></Button>
                  </div>
                </div>
                <p className={`text-2xl font-bold ${liveOf(a)<0?'text-red-600':'text-content'}`}>{formatCurrency(liveOf(a))}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={()=>setAdjust({open:true,account:a,type:'CREDIT'})} className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-green-700 bg-green-50 ring-1 ring-green-100 rounded-lg py-1.5 hover:bg-green-100 transition-colors"><ArrowDownLeft size={13}/> Add</button>
                  <button onClick={()=>setAdjust({open:true,account:a,type:'DEBIT'})} className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-red-700 bg-red-50 ring-1 ring-red-100 rounded-lg py-1.5 hover:bg-red-100 transition-colors"><ArrowUpRight size={13}/> Withdraw</button>
                </div>
                <button onClick={()=>setStatementFor(a)} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 ring-1 ring-brand-100 rounded-lg py-1.5 hover:bg-brand-100 transition-colors"><ScrollText size={13}/> Statement</button>
                <div className="mt-2 flex items-center justify-between text-xs text-faint">
                  <span className="truncate">{a.name}{a.account_number?` · ${mask(a.account_number)}`:''}</span>
                  {a.notes && <span className="truncate max-w-[110px] ml-2">{a.notes}</span>}
                </div>
                <div className="mt-1"><UpdatedAt at={a.updated_at} /></div>
              </CardContent>
            </Card>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null})} title={modal.item?'Edit Account':'Add Bank Account'}>
        <BankForm initial={modal.item} onSave={save} onClose={()=>setModal({open:false,item:null})}/>
      </Modal>
      {statementFor && <StatementModal account={accounts.find(x=>x.id===statementFor.id) || statementFor} onClose={()=>setStatementFor(null)}/>}
      <Modal open={adjust.open} onClose={()=>setAdjust({open:false,account:null})} title="Add / Withdraw Money" size="sm">
        {adjust.account && <AdjustForm account={adjust.account} initialType={adjust.type} onSave={doAdjust} onClose={()=>setAdjust({open:false,account:null})}/>}
      </Modal>
    </div>
  )
}
