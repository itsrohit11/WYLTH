import { create } from 'zustand'
import toast from 'react-hot-toast'

export const useSalaryStore = create((set) => ({
  allocations: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const data = await window.api.salary.getAll()
      set({ allocations: data, loading: false })
    } catch (e) { toast.error(e.message); set({ loading: false }) }
  },

  create: async (data) => {
    const res = await window.api.salary.create(data)
    set((s) => ({ allocations: [res, ...s.allocations] }))
    toast.success('Salary allocation saved!')
    return res
  },

  update: async (id, data) => {
    const res = await window.api.salary.update(id, data)
    set((s) => ({ allocations: s.allocations.map((a) => (a.id === id ? res : a)) }))
    toast.success('Updated!')
    return res
  },

  delete: async (id) => {
    await window.api.salary.delete(id)
    set((s) => ({ allocations: s.allocations.filter((a) => a.id !== id) }))
    toast.success('Deleted!')
  },
}))
