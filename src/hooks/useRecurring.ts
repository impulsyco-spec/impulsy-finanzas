import { useState } from 'react';

export interface RecurringExpense {
  id: string;
  nombre: string;
  valor: number;
  categoria: string;
  diaCobro: number; // día del mes en que se cobra (1-31)
  activo: boolean;
}

const KEY = 'impulsy_recurring_v1';

export function useRecurring() {
  const [items, setItems] = useState<RecurringExpense[]>(() => {
    try {
      const s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const persist = (next: RecurringExpense[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const add = (item: Omit<RecurringExpense, 'id'>) =>
    persist([...items, { ...item, id: crypto.randomUUID() }]);

  const remove = (id: string) => persist(items.filter(i => i.id !== id));

  const update = (id: string, changes: Partial<RecurringExpense>) =>
    persist(items.map(i => i.id === id ? { ...i, ...changes } : i));

  const totalMensual = items.filter(i => i.activo).reduce((s, i) => s + i.valor, 0);

  return { items, add, remove, update, totalMensual };
}
