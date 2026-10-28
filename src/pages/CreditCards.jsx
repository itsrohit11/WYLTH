import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, fmtDate, localToday } from '../lib/utils'
import { CreditCard, Plus, Pencil, Trash2, ChevronRight, ArrowUpRight, ArrowDownLeft, BarChart3, BadgeCheck, AlertTriangle, Clock, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { UpdatedAt } from '../components/ui/UpdatedAt'

const todayStr = localToday
const errMsg = (e) => (e?.message || 'Something went wrong').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const utilColor = (u) => u == null ? 'blue' : u < 30 ? 'green' : u < 75 ? 'orange' : 'red'
const utilText  = (u) => u == null ? 'text-muted' : u < 30 ? 'text-green-600' : u < 75 ? 'text-amber-600' : 'text-red-600'

function CardForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    name:initial.name, bank:initial.bank||'', last4:initial.last4||'',
    credit_limit:initial.credit_limit||'', billing_day:initial.billing_day||'', due_day:initial.due_day||'', notes:initial.notes||''
  } : { name:'', bank:'', last4:'', credit_limit:'', billing_day:'', due_day:'', notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Card Name / Nickname" value={f.name} onChange={e=>s('name',e.target.value)} placeholder="e.g. HDFC Millennia" required/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Bank / Issuer" value={f.bank} onChange={e=>s('bank',e.target.value)} placeholder="e.g. HDFC Bank"/>
        <Input label="Last 4 digits" value={f.last4} onChange={e=>s('last4',e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="1234" maxLength={4}/>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Credit Limit (₹)" type="number" step="any" value={f.credit_limit} onChange={e=>s('credit_limit',e.target.value)} placeholder="e.g. 200000"/>
        <Input label="Statement day" type="number" min={1} max={31} value={f.billing_day} onChange={e=>s('billing_day',e.target.value)} placeholder="1-31"/>
        <Input label="Due day" type="number" min={1} max={31} value={f.due_day} onChange={e=>s('due_day',e.target.value)} placeholder="1-31"/>
      </div>
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Add'} Card</Button>
      </div>
    </form>
  )
}

function AccountSelect({ accounts, value, onChange, label = 'Pay from bank account' }) {
  return (
    <Select label={label} value={value} onChange={e=>onChange(e.target.value)}>
      {accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.bank?` — ${a.bank}`:''} · {formatCurrency(a.balance)}</option>)}
    </Select>
  )
}

// Pay the card bill from a bank account: debits the account (shows on its statement) and
// reduces what you owe on the card.
function PayBillForm({ card, accounts, onSave, onClose }) {
  const st = card.statement || {}
  const defaultAmt = st.statementDue > 0.5 ? st.statementDue : Math.max(0, card.outstanding || 0)
  const preferred = accounts.find(a=>a.purpose==='EXPENSE') || accounts[0]
  const [f, setF] = useState({ amount: defaultAmt ? String(Math.round(defaultAmt*100)/100) : '', account_id: preferred ? String(preferred.id) : '', date: todayStr(), notes: '' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const amt = Number(f.amount)||0
  const acc = accounts.find(a=>String(a.id)===f.account_id)
  const after = acc ? Number(acc.balance) - amt : null
  const submit=async(e)=>{ e.preventDefault(); try { await onSave({ card_id:card.id, type:'PAYMENT', title:'Bill payment', amount:amt, date:f.date, notes:f.notes, account_id: f.account_id || null }); onClose() } catch {} }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-surface-2 rounded-xl p-3"><p className="text-xs text-muted">Statement due</p><p className="text-lg font-bold text-red-600 tabular">{formatCurrency(st.statementDue||0)}</p>{st.dueDate && <p className="text-[11px] text-faint">by {fmtDate(st.dueDate)}</p>}</div>
        <div className="bg-surface-2 rounded-xl p-3"><p className="text-xs text-muted">Total outstanding</p><p className="text-lg font-bold text-content tabular">{formatCurrency(card.outstanding||0)}</p>{st.unbilled>0.5 && <p className="text-[11px] text-faint">{formatCurrency(st.unbilled)} not billed yet</p>}</div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {st.statementDue>0.5 && <button type="button" onClick={()=>s('amount', String(Math.round(st.statementDue*100)/100))} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200">Pay statement {formatCurrency(st.statementDue)}</button>}
        {card.outstanding>0.5 && <button type="button" onClick={()=>s('amount', String(Math.round(card.outstanding*100)/100))} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface-2 text-muted hover:text-content">Pay everything {formatCurrency(card.outstanding)}</button>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount (₹)" type="number" step="any" value={f.amount} onChange={e=>s('amount',e.target.value)} required autoFocus/>
        <Input label="Date paid" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/>
      </div>
      {accounts.length>0
        ? <AccountSelect accounts={accounts} value={f.account_id} onChange={v=>s('account_id',v)}/>
        : <p className="text-xs text-amber-700">No bank account yet — add one in the Bank tab so the payment can come out of it.</p>}
      {acc && amt>0 && <p className="text-xs text-muted">{acc.name} will go from {formatCurrency(acc.balance)} to <b className={after<0?'text-red-600':'text-content'}>{formatCurrency(after)}</b>{after<0?' (overdrawn)':''}. It will appear on that account's statement.</p>}
      <Input label="Note (optional)" value={f.notes} onChange={e=>s('notes',e.target.value)} placeholder="e.g. Oct statement"/>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="success" disabled={!(amt>0)}>Pay {amt>0?formatCurrency(amt):'bill'}</Button>
      </div>
    </form>
  )
}

function TxnForm({ card, onSave, onClose }) {
  const [f, setF] = useState({ title:'', amount:'', category:'', date:todayStr(), notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); try { await onSave({ card_id:card.id, type:'SPEND', ...f, amount:Number(f.amount)||0 }); onClose() } catch {} }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="What for" value={f.title} onChange={e=>s('title',e.target.value)} placeholder="e.g. Amazon order" required/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount (₹)" type="number" step="any" value={f.amount} onChange={e=>s('amount',e.target.value)} required autoFocus/>
        <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/>
      </div>
      <Input label="Category (optional)" value={f.category} onChange={e=>s('category',e.target.value)} placeholder="e.g. Shopping, Fuel, Food"/>
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <p className="text-xs text-muted">This adds to what you owe on the card. To count it in your monthly spending, add it from the Expenses tab with Payment = Card instead.</p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger">Add spend</Button>
      </div>
    </form>
  )
}

// Where this card's money went: by category for the current cycle, and the last 6 months.
function Insights({ cardId }) {
  const [d, setD] = useState(null)
  useEffect(()=>{ window.api.card.insights(cardId).then(setD).catch(()=>setD(null)) }, [cardId])
  if (!d) return null
  const maxCat = Math.max(1, ...d.categories.map(c=>c.total))
  const maxMon = Math.max(1, ...d.months.map(m=>m.total))
  const mLabel = (ym) => new Date(Number(ym.slice(0,4)), Number(ym.slice(5))-1, 1).toLocaleDateString('en-IN',{month:'short'})
  return (
    <div className="grid md:grid-cols-2 gap-5 mt-3 pt-3 border-t border-line">
      <div>
        <p className="text-xs font-semibold text-content mb-2">This cycle by category <span className="font-normal text-muted">· {formatCurrency(d.cycleTotal)}{d.cycleFrom?` since ${fmtDate(d.cycleFrom)}`:''}</span></p>
        {d.categories.length===0 ? <p className="text-xs text-faint">No spends in this cycle yet.</p> : (
          <div className="space-y-1.5">
            {d.categories.slice(0,6).map(c=>(
              <div key={c.name}>
                <div className="flex justify-between text-xs"><span className="text-content truncate">{c.name}</span><span className="tabular text-muted">{formatCurrency(c.total)}</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{width:`${(c.total/maxCat)*100}%`}}/></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-content mb-2">Last 6 months</p>
        <div className="flex items-end gap-2 h-24">
          {d.months.map(m=>(
            <div key={m.ym} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${mLabel(m.ym)}: ${formatCurrency(m.total)}`}>
              <span className="text-[9px] text-faint tabular">{m.total>0?Math.round(m.total/1000)+'k':''}</span>
              <div className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400" style={{height:`${Math.max(m.total>0?6:2,(m.total/maxMon)*70)}%`, opacity:m.total>0?1:0.25}}/>
              <span className="text-[10px] text-muted">{mLabel(m.ym)}</span>
            </div>
          ))}
        </div>
        {d.top.length>0 && <p className="text-[11px] text-muted mt-2">Biggest: {d.top.slice(0,3).map(t=>`${t.title||'Spend'} ${formatCurrency(t.amount)}`).join(' · ')}</p>}
      </div>
    </div>
  )
}

const statusBadge = (st) => {
  if (!st) return null
  if (st.status === 'OVERDUE') return { cls:'bg-red-100 text-red-700', icon:AlertTriangle, text:`Overdue by ${-st.daysToDue} day${st.daysToDue===-1?'':'s'}` }
  if (st.status === 'DUE_SOON') return { cls:'bg-amber-100 text-amber-800', icon:Clock, text: st.daysToDue===0?'Due today':`Due in ${st.daysToDue} day${st.daysToDue===1?'':'s'}` }
  if (st.status === 'UPCOMING') return { cls:'bg-sky-100 text-sky-800', icon:Clock, text: st.daysToDue!=null?`Due in ${st.daysToDue} days`:'Bill pending' }
  if (st.status === 'NO_CYCLE') return { cls:'bg-slate-100 text-slate-700', icon:Clock, text:'Set a statement day for cycles' }
  return { cls:'bg-green-100 text-green-800', icon:BadgeCheck, text:'Bill paid' }
}

export default function CreditCards() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open:false, item:null })
  const [txnModal, setTxnModal] = useState({ open:false, card:null })
  const [payModal, setPayModal] = useState({ open:false, card:null })
  const [accounts, setAccounts] = useState([])
  const [insightId, setInsightId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [txns, setTxns] = useState([])

  const load = () => { setLoading(true); window.api.card.getAll().then(setCards).catch(()=>{}).finally(()=>setLoading(false)); window.api.bank.getAll().then(setAccounts).catch(()=>setAccounts([])) }
  useEffect(()=>{ load() }, [])

  const totalOut = cards.reduce((s,c)=>s+Number(c.outstanding||0),0)
  const totalLimit = cards.reduce((s,c)=>s+Number(c.credit_limit||0),0)
  const totalAvail = totalLimit - totalOut
  const totalUtil = totalLimit>0 ? (totalOut/totalLimit)*100 : null

  const save = async (d) => { if (modal.item) await window.api.card.update(modal.item.id, d); else await window.api.card.create(d); load() }
  const del = async (id) => { await window.api.card.delete(id); if (openId===id) setOpenId(null); load() }
  const toggle = async (c) => { if (openId===c.id) { setOpenId(null); return } setOpenId(c.id); setTxns(await window.api.card.txns(c.id)) }
  const addTxn = async (d) => {
    try {
      await window.api.card.addTxn(d)
      toast.success(d.type==='PAYMENT' ? (d.account_id ? 'Bill paid — account debited' : 'Payment recorded') : 'Spend added')
    } catch (e) { toast.error(errMsg(e)); throw e }
    load(); if (openId===d.card_id) setTxns(await window.api.card.txns(d.card_id))
  }
  const delTxn = async (t, cardId) => {
    if (t.type==='PAYMENT' && t.account_name && !window.confirm(`Remove this payment? ${formatCurrency(t.amount)} will go back into ${t.account_name}.`)) return
    await window.api.card.deleteTxn(t.id, cardId); load(); setTxns(await window.api.card.txns(cardId))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Credit Cards</h2>
          <p className="text-sm text-muted">Statements, due dates and bill payments for every card. Paying a bill comes out of the bank account you choose.</p></div>
        <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add Card</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {label:'Total Outstanding', value:formatCurrency(totalOut), cls:'text-red-600'},
          {label:'Total Limit', value:formatCurrency(totalLimit), cls:'text-content'},
          {label:'Available Credit', value:formatCurrency(totalAvail), cls:'text-green-600'},
          {label:'Utilization', value:totalUtil==null?'—':`${totalUtil.toFixed(1)}%`, cls:utilText(totalUtil)},
        ].map(c=>(
          <Card key={c.label}><CardContent className="py-4 text-center">
            <p className={`text-xl font-bold tabular ${c.cls}`}>{c.value}</p>
            <p className="text-xs text-muted mt-1">{c.label}</p>
          </CardContent></Card>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
      : cards.length===0 ? (
        <Card><CardContent className="text-center py-16 text-faint">
          <CreditCard size={40} className="mx-auto mb-3 text-faint"/>
          <p className="mb-4">No credit cards yet</p>
          <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add your first card</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {cards.map(c=>{
            const open = openId===c.id
            const util = c.utilization
            return (
            <Card key={c.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#18284F] to-[#223566] ring-1 ring-[#D6B875]/40 flex items-center justify-center shrink-0"><CreditCard className="text-white" size={20}/></div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-content leading-tight truncate">{c.name}</h3>
                      <p className="text-xs text-muted">{[c.bank, c.last4?`•••• ${c.last4}`:null].filter(Boolean).join(' · ')||'Credit card'}</p>
                      <UpdatedAt at={c.last_activity || c.updated_at}/>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="success" onClick={()=>setPayModal({open:true,card:c})} disabled={!(c.outstanding>0.5)} title={c.outstanding>0.5?'Pay this card bill from a bank account':'Nothing to pay'}><Wallet size={14}/> Pay bill</Button>
                    <Button size="sm" variant="outline" onClick={()=>setTxnModal({open:true,card:c})}><Plus size={14}/> Spend</Button>
                    <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:c})}><Pencil size={14} className="text-muted"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>del(c.id)}><Trash2 size={14} className="text-red-400"/></Button>
                  </div>
                </div>

                {(() => {
                  const st = c.statement, b = statusBadge(st)
                  if (!st || !b) return null
                  const Icon = b.icon
                  return (
                    <div className={`mt-4 rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap ${st.status==='OVERDUE'?'border-red-300 bg-red-50/60':st.status==='DUE_SOON'?'border-amber-300 bg-amber-50/60':'border-line bg-surface-2/60'}`}>
                      <div>
                        <p className="text-xs text-muted">{st.hasCycle ? `Statement of ${fmtDate(st.statementDate)}` : 'Amount due'}</p>
                        <p className={`text-xl font-bold tabular ${st.statementDue>0.5?'text-red-600':'text-green-600'}`}>{formatCurrency(st.statementDue)}</p>
                        {st.dueDate && st.statementDue>0.5 && <p className="text-[11px] text-muted">Pay by <b className="text-content">{fmtDate(st.dueDate)}</b></p>}
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${b.cls}`}><Icon size={12}/>{b.text}</span>
                      {st.hasCycle && (
                        <div className="text-right">
                          <p className="text-xs text-muted">Not billed yet</p>
                          <p className="text-base font-semibold tabular text-content">{formatCurrency(st.unbilled)}</p>
                          <p className="text-[11px] text-faint">next statement {fmtDate(st.nextStatement)}</p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                  <div><p className="text-xs text-muted">Outstanding</p><p className="text-xl font-bold text-red-600 tabular">{formatCurrency(c.outstanding)}</p></div>
                  <div><p className="text-xs text-muted">Available</p><p className="text-xl font-bold text-green-600 tabular">{c.available==null?'—':formatCurrency(c.available)}</p></div>
                  <div><p className="text-xs text-muted">Limit</p><p className="text-lg font-semibold text-content tabular">{c.credit_limit?formatCurrency(c.credit_limit):'—'}</p></div>
                  <div><p className="text-xs text-muted">Due day</p><p className="text-lg font-semibold text-content">{c.due_day?`${c.due_day}${c.due_day%10===1&&c.due_day!==11?'st':c.due_day%10===2&&c.due_day!==12?'nd':c.due_day%10===3&&c.due_day!==13?'rd':'th'}`:'—'}</p></div>
                </div>

                {util!=null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted">Utilization</span>
                      <span className={`font-semibold ${utilText(util)}`}>{util.toFixed(0)}%{util>=75?' · high':''}</span>
                    </div>
                    <ProgressBar value={Math.min(100,util)} max={100} color={utilColor(util)}/>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 flex-wrap">
                  <button onClick={()=>toggle(c)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                    <ChevronRight size={14} className={`transition-transform ${open?'rotate-90':''}`}/> {open?'Hide':'View'} transactions
                  </button>
                  <button onClick={()=>setInsightId(insightId===c.id?null:c.id)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                    <BarChart3 size={13}/> {insightId===c.id?'Hide':'Show'} spending breakdown
                  </button>
                </div>
                {insightId===c.id && <Insights cardId={c.id}/>}

                {open && (
                  <div className="mt-3 border-t border-line pt-3">
                    {txns.length===0 ? <p className="text-xs text-faint">No transactions yet. Use “Spend” to add one, or charge an expense to this card from the Expenses tab.</p> : (
                      <div className="divide-y divide-line">
                        {txns.map(t=>{
                          const isSpend = t.type!=='PAYMENT'
                          return (
                          <div key={t.id} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSpend?'bg-red-50 text-red-500':'bg-green-50 text-green-600'}`}>
                                {isSpend?<ArrowUpRight size={14}/>:<ArrowDownLeft size={14}/>}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-content truncate">{t.title||(isSpend?'Spend':'Payment')}</p>
                                <p className="text-xs text-faint">{t.date}{t.category?` · ${t.category}`:''}{t.source==='expense'?' · from Expenses':''}{t.account_name?` · paid from ${t.account_name}`:''}{t.notes?` · ${t.notes}`:''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold tabular ${isSpend?'text-red-600':'text-green-600'}`}>{isSpend?'+':'−'}{formatCurrency(t.amount)}</span>
                              {t.source==='txn'
                                ? <button onClick={()=>delTxn(t, c.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13}/></button>
                                : <span className="w-[13px]" title="Edit or delete this in the Expenses tab"/>}
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )})}
        </div>
      )}

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null})} title={modal.item?'Edit Card':'Add Credit Card'}>
        <CardForm initial={modal.item} onSave={save} onClose={()=>setModal({open:false,item:null})}/>
      </Modal>
      <Modal open={payModal.open} onClose={()=>setPayModal({open:false,card:null})} title={`Pay bill — ${payModal.card?.name||''}`} size="sm">
        {payModal.card && <PayBillForm card={payModal.card} accounts={accounts} onSave={addTxn} onClose={()=>setPayModal({open:false,card:null})}/>}
      </Modal>
      <Modal open={txnModal.open} onClose={()=>setTxnModal({open:false,card:null})} title={`Add spend — ${txnModal.card?.name||''}`} size="sm">
        {txnModal.card && <TxnForm card={txnModal.card} onSave={addTxn} onClose={()=>setTxnModal({open:false,card:null})}/>}
      </Modal>
    </div>
  )
}
