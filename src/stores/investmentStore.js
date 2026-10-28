import { create } from 'zustand'
import toast from 'react-hot-toast'

export const useInvestmentStore = create((set) => ({
  investments: [], loading: false,

  fetchAll: async (params) => {
    set({ loading: true })
    try { set({ investments: await window.api.investment.getAll(params), loading: false }) }
    catch (e) { toast.error(e.message); set({ loading: false }) }
  },

  create: async (data) => {
    try {
      const res = await window.api.investment.create(data)
      set((s) => ({ investments: [res, ...s.investments] }))
      toast.success('Investment added!')
      return res
    } catch (e) { toast.error('Could not add investment: ' + e.message); throw e }
  },

  update: async (id, data) => {
    try {
      const res = await window.api.investment.update(id, data)
      set((s) => ({ investments: s.investments.map((x) => (x.id === id ? res : x)) }))
      toast.success('Updated!')
      return res
    } catch (e) { toast.error('Could not update investment: ' + e.message); throw e }
  },

  delete: async (id) => {
    await window.api.investment.delete(id)
    set((s) => ({ investments: s.investments.filter((x) => x.id !== id) }))
    toast.success('Deleted!')
  },
}))
