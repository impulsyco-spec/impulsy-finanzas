import { Client, Project, Payment } from '../types';

export const clients: Client[] = [
  { id: '1', name: 'Juan Perez', company: 'TechNova' },
  { id: '2', name: 'Maria Gomez', company: 'Soluciones MG' },
];

export const projects: Project[] = [
  { id: '1', clientId: '1', name: 'Rediseño Web', plan: 'Premium', totalAmount: 3000, installments: 3, durationMonths: 3, startDate: '2026-01-10', status: 'active' },
  { id: '2', clientId: '2', name: 'Campaña Ads', plan: 'Básico', totalAmount: 1000, installments: 1, durationMonths: 1, startDate: '2026-03-01', status: 'active' },
];

export const payments: Payment[] = [
  { id: '1', projectId: '1', amount: 1000, date: '2026-01-10', status: 'paid' },
  { id: '2', projectId: '1', amount: 1000, date: '2026-02-10', status: 'paid' },
  { id: '3', projectId: '1', amount: 1000, date: '2026-03-10', status: 'pending' },
  { id: '4', projectId: '2', amount: 1000, date: '2026-02-28', status: 'overdue' },
];
