import { create } from 'zustand'
import toast from 'react-hot-toast'

export const useEmergencyStore = create((set) => ({
  fund: null, loading: false,

  fetch: async () => {
    set({ loading: true })
    try { set({ fund: await window.api.emergency.get(), loading: false }) }
    catch (e) { set({ fund: null, loading: false }) }
  },

  save: async (data) => {
    try {
      const res = await window.api.emergency.save(data)
      set({ fund: res })
      toast.success('Emergency fund updated!')
      return res
    } catch (e) { toast.error('Could not save emergency fund: ' + e.message); throw e }
  },

  addContribution: async (id, amount, note, date) => {
    try {
      const res = await window.api.emergency.addContribution(id, amount, note, date)
      set({ fund: res })
      const abs = Math.abs(Number(amount)).toLocaleString('en-IN')
      toast.success(Number(amount) < 0 ? `₹${abs} withdrawn` : `₹${abs} added!`)
      return res
    } catch (e) { toast.error((e.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); throw e }
  },
}))
