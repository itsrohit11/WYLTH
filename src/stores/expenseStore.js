import { create } from 'zustand'
import toast from 'react-hot-toast'

export const useExpenseStore = create((set) => ({
  expenses: [],
  loading: false,
  filters: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },

  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

  fetchByMonthYear: async (month, year) => {
    set({ loading: true })
    try {
      const data = await window.api.expense.getAll({ month, year })
      set({ expenses: data, loading: false })
    } catch (e) { toast.error(e.message); set({ loading: false }) }
  },

  create: async (data) => {
    const res = await window.api.expense.create(data)
    set((s) => ({ expenses: [res, ...s.expenses] }))
    toast.success('Expense added!')
    return res
  },

  update: async (id, data) => {
    const res = await window.api.expense.update(id, data)
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? res : e)) }))
    toast.success('Updated!')
    return res
  },

  // Soft delete — the row is kept in the database (in Trash) and removed from the visible list.
  // The component shows an "Undo" toast rather than a success toast, so no toast here.
  delete: async (id) => {
    await window.api.expense.delete(id)
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }))
  },

  // Bring a soft-deleted expense back. The caller refreshes the list/balance afterwards.
  restore: async (id) => {
    await window.api.expense.restore(id)
  },
}))
