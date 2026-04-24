import React, { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useLedger } from '../hooks/useLedger';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { AddLedgerModal } from '../components/AddLedgerModal';
import { supabase } from '../lib/supabase';
import { LedgerMovement } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const today = new Date().toISOString().split('T')[0];

export const PorPagar: React.FC = () => {
  const { movements, realAccounts, pockets, loading, refetch } = useLedger();
  const { clients, projects } = useSupabaseData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerMovement | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  const pending = movements.filter(
    m => m.naturaleza === 'egreso' && (m.estado === 'esperado' || m.estado === 'facturado')
  ).sort((a, b) => (a.fechaVencimiento || '9999') > (b.fechaVencimiento || '9999') ? 1 : -1);

  const total   = pending.reduce((s, m) => s + m.valor, 0);
  const vencido = pending.filter(m => m.fechaVencimiento && m.fechaVencimiento < today).reduce((s, m) => s + m.valor, 0);

  const marcarPagado = async (id: string) => {
    setMarking(id);
    try {
      await supabase.from('ledger_movements').update({ estado: 'confirmado' }).eq('id', id);
      refetch();
    } finally { setMarking(null); }
  };

  const urgencia = (m: LedgerMovement) => {
    if (!m.fechaVencimiento) return 'neutro';
    if (m.fechaVencimiento < today) return 'rojo';
    const dias = Math.floor((new Date(m.fechaVencimiento).getTime() - Date.now()) / 86400000);
    return dias <= 7 ? 'amarillo' : 'verde';
  };

  const urg: Record<string, string> = { rojo: '#ef4444', amarillo: '#f59e0b', verde: '#10b981', neutro: '#71717a' };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Por Pagar</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Egresos pendientes de pago.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={16} /> Registrar Pago Pendiente
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
        {[
          { label: 'Total por Pagar', value: fmt(total),   color: '#ef4444' },
          { label: 'Vencido',         value: fmt(vencido), color: '#ef4444' },
          { label: 'Facturas',        value: String(pending.length), color: '#fff' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Urgencia</th>
                <th>Descripción / Proveedor</th>
                <th>Proyecto</th>
                <th>Categoría</th>
                <th>Vence</th>
                <th>Valor</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(m => {
                const proj = projects.find(p => p.id === m.projectId);
                const u = urgencia(m);
                return (
                  <tr key={m.id}>
                    <td>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: urg[u], display: 'inline-block' }} />
                    </td>
                    <td>
                      <div style={{ color: '#fff', fontWeight: 500 }}>{m.descripcion}</div>
                      {m.tercero && <div style={{ fontSize: '0.75rem', color: '#71717a' }}>{m.tercero}</div>}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{proj?.name || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{m.categoria || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: u === 'rojo' ? '#ef4444' : '#a0aec0' }}>
                      {m.fechaVencimiento
                        ? new Date(m.fechaVencimiento + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
                        : '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: '#ef4444' }}>{fmt(m.valor)}</td>
                    <td>
                      <button
                        onClick={() => marcarPagado(m.id)}
                        disabled={marking === m.id}
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      >
                        <CheckCircle2 size={13} />
                        {marking === m.id ? '...' : 'Marcar Pagado'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pending.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#71717a', padding: '3rem' }}>
                  🎉 Sin pagos pendientes
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddLedgerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        realAccounts={realAccounts} pockets={pockets}
        projects={projects} clients={clients}
        editing={editing}
      />
    </div>
  );
};
