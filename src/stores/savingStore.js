import { create } from 'zustand'
import toast from 'react-hot-toast'

export const useSavingStore = create((set) => ({
  savings: [], loading: false, balance: null,

  fetchAll: async () => {
    set({ loading: true })
    try { set({ savings: await window.api.saving.getAll(), loading: false }) }
    catch (e) { toast.error(e.message); set({ loading: false }) }
  },

  fetchBalance: async () => {
    try { set({ balance: await window.api.saving.getBalance() }) }
    catch (e) { /* non-fatal: balance card just won't show */ }
  },

  setAchieved: async (id, achieved) => {
    try {
      const res = await window.api.saving.setAchieved(id, achieved)
      set((s) => ({ savings: s.savings.map((x) => (x.id === id ? res : x)) }))
      await useSavingStore.getState().fetchBalance()
      toast.success(achieved ? 'Marked as purchased!' : 'Marked as not purchased')
    } catch (e) { toast.error(e.message) }
  },

  addMoney: async (amount, note, date) => {
    try {
      await window.api.saving.addMoney(amount, note, date)
      await useSavingStore.getState().fetchBalance()
      toast.success(Number(amount) < 0 ? 'Withdrawn from savings' : 'Added to savings!')
    } catch (e) { toast.error((e.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
  },

  create: async (data) => {
    const res = await window.api.saving.create(data)
    set((s) => ({ savings: [res, ...s.savings] }))
    toast.success('Goal created!')
    return res
  },

  update: async (id, data) => {
    const res = await window.api.saving.update(id, data)
    set((s) => ({ savings: s.savings.map((x) => (x.id === id ? res : x)) }))
    await useSavingStore.getState().fetchBalance()
    toast.success('Updated!')
    return res
  },

  addTransaction: async (id, amount, type, date, notes) => {
    try {
      const res = await window.api.saving.addTransaction(id, amount, type, date, notes)
      set((s) => ({ savings: s.savings.map((x) => (x.id === id ? res : x)) }))
      await useSavingStore.getState().fetchBalance()
      toast.success('Transaction recorded!')
      return res
    } catch (e) { toast.error((e.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); throw e }
  },

  delete: async (id) => {
    await window.api.saving.delete(id)
    set((s) => ({ savings: s.savings.filter((x) => x.id !== id) }))
    await useSavingStore.getState().fetchBalance()
    toast.success('Deleted!')
  },
}))
