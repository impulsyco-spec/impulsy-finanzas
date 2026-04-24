import React, { useState, useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  TipoMovimiento, TIPO_MOV_LABELS, NATURALEZA_POR_TIPO,
  CATS_INGRESO, CATS_EGRESO, MESES_ES,
  RealAccount, Pocket, LedgerMovement,
} from '../types';
import type { Project, Client } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  realAccounts: RealAccount[];
  pockets: Pocket[];
  projects: Project[];
  clients: Client[];
  editing?: LedgerMovement | null;
}

const TIPOS: TipoMovimiento[] = [
  'ingreso_operativo','egreso_operativo','transferencia',
  'retiro_fundador','aporte_capital','deuda_recibida','pago_deuda','impuesto','ajuste',
];

const TIPO_HINTS: Partial<Record<TipoMovimiento, string>> = {
  ingreso_operativo:  'Pago de un cliente por servicios.',
  egreso_operativo:   'Gasto de la operación (freelancers, herramientas, etc.).',
  transferencia:      'Mover dinero entre cuentas o bolsillos. No afecta ingresos ni gastos.',
  retiro_fundador:    'El fundador saca dinero para sí mismo. No es gasto operativo.',
  aporte_capital:     'El fundador pone dinero de su propio bolsillo a la empresa.',
  deuda_recibida:     'Recibes un préstamo. No es ingreso operativo.',
  pago_deuda:         'Pagas una cuota de préstamo o deuda.',
  impuesto:           'Pago de IVA, renta u otros tributos.',
  ajuste:             'Corrección de saldo por diferencia o error.',
};

const empty = {
  fecha: new Date().toISOString().split('T')[0],
  tipo: 'ingreso_operativo' as TipoMovimiento,
  descripcion: '',
  valor: '',
  categoria: '',
  estado: 'confirmado',
  cuenta_real_id: '',
  cuenta_destino_id: '',
  pocket_id: '',
  pocket_destino_id: '',
  project_id: '',
  client_id: '',
  tercero: '',
  fecha_vencimiento: '',
  notas: '',
  personal_flag: false,
  tipo_retiro: '',
};

export const AddLedgerModal: React.FC<Props> = ({
  isOpen, onClose, onSuccess, realAccounts, pockets, projects, clients, editing,
}) => {
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        fecha: editing.fecha,
        tipo: editing.tipoMovimiento,
        descripcion: editing.descripcion,
        valor: String(editing.valor),
        categoria: editing.categoria || '',
        estado: editing.estado === 'confirmado' ? 'confirmado' : 'esperado',
        cuenta_real_id: editing.cuentaRealId || '',
        cuenta_destino_id: '',
        pocket_id: editing.pocketId || '',
        pocket_destino_id: '',
        project_id: editing.projectId || '',
        client_id: editing.clientId || '',
        tercero: editing.tercero || '',
        fecha_vencimiento: editing.fechaVencimiento || '',
        notas: editing.notas || '',
        personal_flag: editing.personalFlag,
        tipo_retiro: editing.tipoRetiro || '',
      });
    } else {
      setForm({ ...empty, fecha: new Date().toISOString().split('T')[0] });
    }
  }, [editing, isOpen]);

  if (!isOpen) return null;

  const naturaleza = NATURALEZA_POR_TIPO[form.tipo];
  const isTransfer = form.tipo === 'transferencia';
  const cats = naturaleza === 'ingreso' ? CATS_INGRESO : CATS_EGRESO;
  const mesIndex = new Date(form.fecha + 'T12:00:00').getMonth();
  const mes = MESES_ES[mesIndex] || '';

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const terceroLabel = naturaleza === 'ingreso' ? 'Cliente / Fuente'
    : naturaleza === 'egreso' ? 'Proveedor'
    : 'Tercero';

  const handleSave = async () => {
    if (!form.fecha || !form.descripcion.trim() || !form.valor || Number(String(form.valor).replace(/\./g,'')) <= 0) {
      alert('Completa fecha, descripción y valor.'); return;
    }
    if (isTransfer && !form.cuenta_destino_id && !form.pocket_destino_id) {
      alert('Para una transferencia debes indicar la cuenta o bolsillo de destino.'); return;
    }
    setSaving(true);
    try {
      const valorNum = Number(String(form.valor).replace(/\./g, ''));
      const base = {
        fecha: form.fecha,
        tipo_movimiento: form.tipo,
        naturaleza,
        descripcion: form.descripcion.trim(),
        valor: valorNum,
        categoria: (!isTransfer && form.categoria) ? form.categoria : null,
        estado: form.estado,
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        tercero: form.tercero.trim() || null,
        fecha_vencimiento: form.estado === 'esperado' ? (form.fecha_vencimiento || null) : null,
        notas: form.notas.trim() || null,
        personal_flag: form.personal_flag,
        tipo_retiro: form.tipo === 'retiro_fundador' ? (form.tipo_retiro || null) : null,
        mes,
        updated_at: new Date().toISOString(),
      };

      if (isTransfer) {
        const origenNombre = realAccounts.find(a => a.id === form.cuenta_real_id)?.nombre
          || pockets.find(p => p.id === form.pocket_id)?.nombre || 'origen';
        const destinoNombre = realAccounts.find(a => a.id === form.cuenta_destino_id)?.nombre
          || pockets.find(p => p.id === form.pocket_destino_id)?.nombre || 'destino';

        await supabase.from('ledger_movements').insert([
          {
            ...base,
            naturaleza: 'neutro',
            cuenta_real_id: form.cuenta_real_id || null,
            pocket_id: form.pocket_id || null,
            descripcion: `Transferencia → ${destinoNombre}`,
          },
          {
            ...base,
            naturaleza: 'neutro',
            cuenta_real_id: form.cuenta_destino_id || null,
            pocket_id: form.pocket_destino_id || null,
            descripcion: `Transferencia ← ${origenNombre}`,
          },
        ]);
      } else if (editing) {
        const { error } = await supabase.from('ledger_movements').update({
          ...base,
          cuenta_real_id: form.cuenta_real_id || null,
          pocket_id: form.pocket_id || null,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ledger_movements').insert({
          ...base,
          cuenta_real_id: form.cuenta_real_id || null,
          pocket_id: form.pocket_id || null,
        });
        if (error) throw error;
      }

      onSuccess(); onClose();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const fmtInput = (v: string) => {
    const n = v.replace(/\D/g, '');
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const inp: React.CSSProperties = {
    width: '100%', background: '#1a1a1a', border: '1px solid #333',
    color: '#fff', padding: '0.6rem 0.75rem', borderRadius: '8px',
    fontSize: '0.875rem', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#71717a',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.3rem',
  };

  const natColor = naturaleza === 'ingreso' ? '#10b981' : naturaleza === 'egreso' ? '#ef4444' : '#a1a1aa';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div className="card" style={{ width: '640px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', border: '1px solid #333' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>
            {editing ? 'Editar Movimiento' : 'Nuevo Movimiento'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>

          {/* Tipo */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Tipo de Movimiento *</label>
            <select style={inp} value={form.tipo} onChange={e => set('tipo', e.target.value as TipoMovimiento)}>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_MOV_LABELS[t]}</option>)}
            </select>
            {TIPO_HINTS[form.tipo] && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: natColor }}>
                <strong>{naturaleza === 'ingreso' ? '↑ Ingreso' : naturaleza === 'egreso' ? '↓ Egreso' : '⇄ Neutro'}</strong>
                {' — '}{TIPO_HINTS[form.tipo]}
              </div>
            )}
          </div>

          {/* Fecha */}
          <div>
            <label style={lbl}>Fecha *</label>
            <input type="date" style={inp} value={form.fecha} onChange={e => set('fecha', e.target.value)} />
          </div>

          {/* Valor */}
          <div>
            <label style={lbl}>Valor COP *</label>
            <input type="text" inputMode="numeric"
              style={{ ...inp, color: '#66fcf1', fontWeight: 700, fontSize: '1rem' }}
              value={form.valor}
              onChange={e => set('valor', fmtInput(e.target.value))}
              placeholder="0"
            />
          </div>

          {/* Descripción */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Descripción *</label>
            <input type="text" style={inp} value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              placeholder={isTransfer ? 'Ej. Distribución corte 15 de abril' : 'Ej. Pago mensualidad KP Skincare'} />
          </div>

          {/* ── TRANSFERENCIA: Origen → Destino ── */}
          {isTransfer ? (
            <>
              <div style={{ gridColumn: '1 / -1', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  ⇄ Ruta del dinero
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'center' }}>
                  {/* Origen */}
                  <div>
                    <label style={{ ...lbl, color: '#a855f7' }}>Desde (Cuenta)</label>
                    <select style={inp} value={form.cuenta_real_id} onChange={e => set('cuenta_real_id', e.target.value)}>
                      <option value="">Cuenta origen...</option>
                      {realAccounts.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                    <label style={{ ...lbl, color: '#a855f7', marginTop: '0.5rem' }}>Desde (Bolsillo)</label>
                    <select style={inp} value={form.pocket_id} onChange={e => set('pocket_id', e.target.value)}>
                      <option value="">Bolsillo origen...</option>
                      {pockets.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <ArrowRight size={20} style={{ color: '#a855f7', flexShrink: 0 }} />
                  {/* Destino */}
                  <div>
                    <label style={{ ...lbl, color: '#a855f7' }}>Hacia (Cuenta)</label>
                    <select style={inp} value={form.cuenta_destino_id} onChange={e => set('cuenta_destino_id', e.target.value)}>
                      <option value="">Cuenta destino...</option>
                      {realAccounts.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                    <label style={{ ...lbl, color: '#a855f7', marginTop: '0.5rem' }}>Hacia (Bolsillo)</label>
                    <select style={inp} value={form.pocket_destino_id} onChange={e => set('pocket_destino_id', e.target.value)}>
                      <option value="">Bolsillo destino...</option>
                      {pockets.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Categoría */}
              <div>
                <label style={lbl}>Categoría</label>
                <select style={inp} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                  <option value="">Sin categoría</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label style={lbl}>Estado</label>
                <select style={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
                  <option value="confirmado">Recibido — Ya está en mi cuenta</option>
                  <option value="esperado">Esperado — Acordado, aún no recibido</option>
                </select>
              </div>

              {/* Cuenta real */}
              <div>
                <label style={lbl}>Cuenta (dónde entra/sale)</label>
                <select style={inp} value={form.cuenta_real_id} onChange={e => set('cuenta_real_id', e.target.value)}>
                  <option value="">Sin cuenta</option>
                  {realAccounts.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>

              {/* Bolsillo */}
              <div>
                <label style={lbl}>Bolsillo (para qué es)</label>
                <select style={inp} value={form.pocket_id} onChange={e => set('pocket_id', e.target.value)}>
                  <option value="">Sin bolsillo</option>
                  {pockets.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.porcentajeDefault ? `· ${p.porcentajeDefault}%` : ''}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Proyecto */}
          <div>
            <label style={lbl}>Proyecto</label>
            <select style={inp} value={form.project_id} onChange={e => {
              set('project_id', e.target.value);
              const proj = projects.find(p => p.id === e.target.value);
              if (proj && !form.client_id) set('client_id', proj.clientId);
            }}>
              <option value="">Sin proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Tercero contextual */}
          <div>
            <label style={lbl}>{terceroLabel}</label>
            <input type="text" style={inp} value={form.tercero}
              onChange={e => set('tercero', e.target.value)}
              placeholder={naturaleza === 'ingreso' ? 'Nombre del cliente' : naturaleza === 'egreso' ? 'Nombre del proveedor' : 'Tercero'} />
          </div>

          {/* Fecha vencimiento — solo si es Esperado */}
          {form.estado === 'esperado' && !isTransfer && (
            <div>
              <label style={lbl}>Fecha esperada de pago</label>
              <input type="date" style={inp} value={form.fecha_vencimiento}
                onChange={e => set('fecha_vencimiento', e.target.value)} />
            </div>
          )}

          {/* Tipo retiro */}
          {form.tipo === 'retiro_fundador' && (
            <div>
              <label style={lbl}>Tipo de Retiro</label>
              <select style={inp} value={form.tipo_retiro} onChange={e => set('tipo_retiro', e.target.value)}>
                <option value="">Seleccionar</option>
                <option value="sueldo_aprobado">Sueldo del mes</option>
                <option value="anticipo_sueldo">Anticipo de sueldo</option>
                <option value="retiro_extraordinario">Retiro extraordinario</option>
                <option value="gasto_personal_empresa">Gasto personal en caja empresa</option>
              </select>
            </div>
          )}

          {/* Notas */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Notas (opcional)</label>
            <input type="text" style={inp} value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder="Observaciones, número de factura, etc." />
          </div>

          {/* Personal flag */}
          {!isTransfer && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.6rem 0.75rem', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
                <input type="checkbox" checked={form.personal_flag} onChange={e => set('personal_flag', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }} />
                <span style={{ color: '#f59e0b', fontSize: '0.875rem', fontWeight: 600 }}>
                  ⚠️ Gasto personal pagado con caja empresa
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #222' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
};
