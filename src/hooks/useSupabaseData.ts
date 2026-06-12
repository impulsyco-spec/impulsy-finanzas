import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Client, Project, Payment } from '../types';

export function useSupabaseData() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [clientsRes, projectsRes, paymentsRes] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('payments').select('*')
    ]);

    if (clientsRes.data) setClients(clientsRes.data.map(c => ({
      ...c, id: c.id, email: c.email || '',
      origen: c.origen || undefined,
      createdAt: c.created_at ? String(c.created_at).slice(0, 10) : undefined,
    })));
    if (projectsRes.data) {
      setProjects(projectsRes.data.map(p => ({
        id: p.id,
        clientId: p.client_id,
        name: p.name,
        plan: p.plan,
        totalAmount: Number(p.total_amount),
        installments: p.installments,
        durationMonths: p.duration_months || p.installments,
        status: p.status,
        startDate: p.start_date || p.created_at,
        isRecurring: Boolean(p.is_recurring)
      })));
    }
    if (paymentsRes.data) {
      setPayments(paymentsRes.data.map(p => ({
        id: p.id,
        projectId: p.project_id,
        amount: Number(p.amount),
        actualAmount: p.actual_amount ? Number(p.actual_amount) : undefined,
        date: p.date,
        status: p.status,
        ledgerMovementId: p.ledger_movement_id || undefined,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { clients, projects, payments, loading, refetch: fetchData };
}
