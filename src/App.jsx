import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout/Layout'
import LockScreen from './components/LockScreen'
import Dashboard from './pages/Dashboard'
import Salary from './pages/Salary'
import Expenses from './pages/Expenses'
import MonthlySpending from './pages/MonthlySpending'
import Savings from './pages/Savings'
import Investments from './pages/Investments'
import EmergencyFund from './pages/EmergencyFund'
import Bank from './pages/Bank'
import CreditCards from './pages/CreditCards'
import Bills from './pages/Bills'
import RecurringAndBills from './pages/RecurringAndBills'
import Loans from './pages/Loans'
import Analytics from './pages/Analytics'
import Export from './pages/Export'
import Notes from './pages/Notes'

export default function App() {
  const [unlocked, setUnlocked] = useState(false)

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />

  return (
    <HashRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000,
        style: { borderRadius: '8px', background: '#1e293b', color: '#e2e8f0' } }} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="salary" element={<Salary />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="monthly-spending" element={<MonthlySpending />} />
          <Route path="savings" element={<Savings />} />
          <Route path="investments" element={<Investments />} />
          <Route path="emergency-fund" element={<EmergencyFund />} />
          <Route path="bank" element={<Bank />} />
          <Route path="cards" element={<CreditCards />} />
          <Route path="bills" element={<Bills />} />
          <Route path="recurring" element={<RecurringAndBills />} />
          <Route path="loans" element={<Loans />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="notes" element={<Notes />} />
          <Route path="export" element={<Export />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
