import { useEffect, useState } from 'react'
import { IndianRupee, Lock, ShieldCheck, KeyRound } from 'lucide-react'

const field = 'w-full px-4 py-3 text-sm text-content border border-line rounded-2xl bg-surface-2/70 placeholder-faint transition-all hover:border-brand-400/50 focus:outline-none focus:border-brand-400 focus:shadow-focus'
const btn = 'w-full py-3 bg-gradient-to-r from-[#4F7FF5] via-[#6B73FF] to-[#8B6CFF] text-white rounded-full text-sm font-semibold transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50'

export default function LockScreen({ onUnlock }) {
  const [mode, setMode] = useState('loading') // loading | set | enter | reset
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [attempts, setAttempts] = useState(0)
  const blocked = attempts >= 5

  useEffect(() => { window.api.auth.status().then(s => setMode(s.hasPassword ? 'enter' : 'set')).catch(() => setMode('set')) }, [])

  const reset = () => { setPw(''); setPw2(''); setCode(''); setErr('') }

  const doSet = async (e) => {
    e.preventDefault(); setErr('')
    if (pw.length < 4) return setErr('Use at least 4 characters')
    if (pw !== pw2) return setErr('Passwords do not match')
    await window.api.auth.setPassword(pw); onUnlock()
  }
  const doEnter = async (e) => {
    e.preventDefault(); setErr('')
    const r = await window.api.auth.verify(pw)
    if (r.ok) onUnlock(); else setErr('Incorrect password')
  }
  const doReset = async (e) => {
    e.preventDefault(); setErr('')
    if (blocked) return setErr('Too many wrong attempts. Restart the app to try again.')
    if (pw.length < 4) return setErr('New password must be at least 4 characters')
    if (pw !== pw2) return setErr('Passwords do not match')
    const r = await window.api.auth.resetWithCode(code, pw)
    if (r.ok) onUnlock()
    else { const n = attempts + 1; setAttempts(n); setErr(`Wrong reset code (${n}/5 attempts)`) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-sm card-surface ledger-margin shadow-lift !rounded-[28px] pl-12 pr-8 py-9 relative animate-scale-in">
        <div className="flex flex-col items-center mb-7">
          <span className="w-14 h-14 rounded-3xl sig-fill flex items-center justify-center shadow-glow mb-4"><IndianRupee size={26} strokeWidth={2.75} className="text-white"/></span>
          <h1 className="font-logo logo-grad text-3xl">WYLTH</h1>
          <p className="text-xs text-faint mt-0.5">Grow quietly</p>
        </div>

        {mode === 'loading' && <p className="text-center text-sm text-faint py-6">Loading…</p>}

        {mode === 'set' && (
          <form onSubmit={doSet} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted"><ShieldCheck size={16} className="text-brand-600"/> Set a password to protect your app</div>
            <input className={field} type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)} autoFocus/>
            <input className={field} type="password" placeholder="Confirm password" value={pw2} onChange={e=>setPw2(e.target.value)}/>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button className={btn}>Set Password &amp; Continue</button>
          </form>
        )}

        {mode === 'enter' && (
          <form onSubmit={doEnter} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted"><Lock size={16} className="text-brand-600"/> Enter your password to unlock</div>
            <input className={field} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} autoFocus/>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button className={btn}>Unlock</button>
            <button type="button" onClick={()=>{ reset(); setMode('reset') }} className="w-full text-xs text-faint hover:text-content pt-1">Forgot password? Reset</button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={doReset} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted"><KeyRound size={16} className="text-brand-600"/> Reset password</div>
            <p className="text-xs text-faint">Enter the reset code, then choose a new password.</p>
            <input className={field} placeholder="Reset code" value={code} onChange={e=>setCode(e.target.value)} autoFocus disabled={blocked}/>
            <input className={field} type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)} disabled={blocked}/>
            <input className={field} type="password" placeholder="Confirm new password" value={pw2} onChange={e=>setPw2(e.target.value)} disabled={blocked}/>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button disabled={blocked} className={btn}>Reset &amp; Unlock</button>
            <button type="button" onClick={()=>{ reset(); setMode('enter') }} className="w-full text-xs text-faint hover:text-content pt-1">Back to login</button>
          </form>
        )}
      </div>
    </div>
  )
}
