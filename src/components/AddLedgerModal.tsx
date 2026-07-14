import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { hoyISO } from '../lib/dates';
import { calcFounderStatus } from '../lib/founderRules';
import {
  TipoMovimiento, TIPO_MOV_LABELS, NATURALEZA_POR_TIPO,
  CATS_INGRESO, CATS_EGRESO, MESES_ES,
  RealAccount, Pocket, LedgerMovement, TeamMember,
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
  teamMembers?: TeamMember[];
  editing?: LedgerMovement | null;
  defaultNaturaleza?: 'ingreso' | 'egreso' | 'neutro';
  movements?: LedgerMovement[]; // para mostrar el saldo personal de la quincena al marcar gasto personal
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
  fecha: hoyISO(),
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
  team_member_id: '',
  tercero: '',
  fecha_vencimiento: '',
  notas: '',
  personal_flag: false,
  tipo_retiro: '',
};

export const AddLedgerModal: React.FC<Props> = ({
  isOpen, onClose, onSuccess, realAccounts, pockets, projects, clients, teamMembers = [], editing, defaultNaturaleza, movements = [],
}) => {
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const founderStatus = useMemo(
    () => (movements.length > 0 ? calcFounderStatus(movements) : null),
    [movements]
  );

  useEffect(() => {
    if (editing) {
      setForm({
        fecha: editing.fecha,
        tipo: editing.tipoMovimiento,
        descripcion: editing.descripcion,
        valor: String(editing.valor),
        categoria: editing.categoria || '',
        estado: editing.estado,
        cuenta_real_id: editing.cuentaRealId || '',
        cuenta_destino_id: '',
        pocket_id: editing.pocketId || '',
        pocket_destino_id: '',
        project_id: editing.projectId || '',
        client_id: editing.clientId || '',
        team_member_id: editing.teamMemberId || '',
        tercero: editing.tercero || '',
        fecha_vencimiento: editing.fechaVencimiento || '',
        notas: editing.notas || '',
        personal_flag: editing.personalFlag,
        tipo_retiro: editing.tipoRetiro || '',
      });
    } else {
      const boldAcc = realAccounts.find(a => a.nombre.toLowerCase().includes('bold'));
      const defaultTipo: TipoMovimiento =
        defaultNaturaleza === 'ingreso' ? 'ingreso_operativo' :
        defaultNaturaleza === 'egreso'  ? 'egreso_operativo' :
        defaultNaturaleza === 'neutro'  ? 'transferencia' : 'ingreso_operativo';
      setForm({ ...empty, fecha: hoyISO(), cuenta_real_id: boldAcc?.id || '', tipo: defaultTipo });
    }
  }, [editing, isOpen, realAccounts, defaultNaturaleza]);

  if (!isOpen) return null;

  const naturaleza = NATURALEZA_POR_TIPO[form.tipo];
  const isTransfer = form.tipo === 'transferencia';
  const cats = naturaleza === 'ingreso' ? CATS_INGRESO : CATS_EGRESO;
  const mesIndex = new Date(form.fecha + 'T12:00:00').getMonth();
  const mes = MESES_ES[mesIndex] || '';

  // Filter tipo options when a naturaleza is pre-selected (new movement only)
  const tiposToShow = (!editing && defaultNaturaleza)
    ? TIPOS.filter(t => NATURALEZA_POR_TIPO[t] === defaultNaturaleza)
    : TIPOS;

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const terceroLabel = naturaleza === 'egreso' ? 'Proveedor' : 'Tercero';

  // Para ingresos solo se usan dos estados: recibido o esperado ("facturado" se eliminó por decisión de Agustín)
  const estadoOpts = naturaleza === 'egreso'
    ? [
        { v: 'confirmado', l: 'Pagado — Ya salió de mi cuenta' },
        { v: 'esperado',   l: 'Por pagar — Acordado, aún no pagado' },
      ]
    : [
        { v: 'confirmado', l: 'Recibido — Ya está en mi cuenta' },
        { v: 'esperado',   l: 'Esperado — Acordado, aún no recibido' },
      ];

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
      // Bono del fundador: se marca con nota founder:bono:<YYYY-MM> para que Nómina
      // lo cuente como bono y el puente lo espeje a Personal como Bonificación.
      const esBonoFundador = form.tipo === 'retiro_fundador' && form.tipo_retiro === 'bono_fundador';
      const notasFinal = esBonoFundador
        ? `founder:bono:${form.fecha.slice(0, 7)}`
        : (form.notas.trim() || null);
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
        team_member_id: form.team_member_id || null,
        tercero: form.tercero.trim() || null,
        fecha_vencimiento: (form.estado === 'esperado' || form.estado === 'facturado') ? (form.fecha_vencimiento || null) : null,
        notas: notasFinal,
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
        // Sincronizar payment vinculado si existe
        if (editing.paymentId) {
          const valorNum = Number(String(form.valor).replace(/\./g, ''));
          const isConfirmed = form.estado === 'confirmado';
          await supabase.from('payments').update({
            amount: valorNum,
            actual_amount: isConfirmed ? valorNum : null,
            status: isConfirmed ? 'paid' : 'pending',
          }).eq('id', editing.paymentId);
        }
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
          <h2 style={{ color: natColor, fontWeight: 800, fontSize: '1.1rem' }}>
            {editing ? 'Editar Movimiento' :
              naturaleza === 'ingreso' ? '↑ Nuevo Ingreso' :
              naturaleza === 'egreso' ? '↓ Nuevo Egreso' : '⇄ Nuevo Movimiento'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>

          {/* Tipo */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Tipo de Movimiento *</label>
            <select style={inp} value={form.tipo} onChange={e => set('tipo', e.target.value as TipoMovimiento)}>
              {tiposToShow.map(t => <option key={t} value={t}>{TIPO_MOV_LABELS[t]}</option>)}
            </select>
            {TIPO_HINTS[form.tipo] && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: natColor }}>
                {TIPO_HINTS[form.tipo]}
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
              {/* Categoría — elegir "Personal" marca automáticamente el gasto como personal */}
              <div>
                <label style={lbl}>Categoría</label>
                <select style={inp} value={form.categoria} onChange={e => {
                  const v = e.target.value;
                  setForm(f => ({ ...f, categoria: v, personal_flag: v === 'Personal' ? true : f.personal_flag }));
                }}>
                  <option value="">Sin categoría</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label style={lbl}>Estado</label>
                <select style={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
                  {estadoOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
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

          {/* Cliente → Proyecto: primero el cliente, y el proyecto se filtra según el cliente */}
          <div>
            <label style={lbl}>Cliente</label>
            <select style={inp} value={form.client_id} onChange={e => {
              const cid = e.target.value;
              setForm(f => {
                const projActual = projects.find(p => p.id === f.project_id);
                return {
                  ...f,
                  client_id: cid,
                  // si el proyecto elegido no es de este cliente, se limpia
                  project_id: projActual && projActual.clientId === cid ? f.project_id : '',
                };
              });
            }}>
              <option value="">Sin cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
            </select>
            <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>
              Al elegir cliente, abajo solo verás sus proyectos.
            </div>
          </div>

          {/* Proyecto (filtrado por cliente) */}
          <div>
            <label style={lbl}>Proyecto {form.client_id ? 'del cliente' : ''}</label>
            <select style={inp} value={form.project_id} onChange={e => {
              const proj = projects.find(p => p.id === e.target.value);
              setForm(f => ({
                ...f,
                project_id: e.target.value,
                client_id: proj ? proj.clientId : f.client_id,
              }));
            }}>
              <option value="">Sin proyecto</option>
              {projects
                .filter(p => !form.client_id || p.clientId === form.client_id)
                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>
              Vincula este movimiento a un proyecto específico para trackear su P&L.
            </div>
          </div>

          {/* Responsable del equipo — solo para egresos */}
          {naturaleza === 'egreso' && teamMembers.length > 0 && (
            <div>
              <label style={lbl}>Responsable / Proveedor</label>
              <select style={inp} value={form.team_member_id} onChange={e => set('team_member_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {teamMembers.filter(m => m.activo).map(m => (
                  <option key={m.id} value={m.id}>{m.nombre} · {m.rol}</option>
                ))}
              </select>
              <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>
                Asigna a un miembro del equipo para trackear sus pagos.
              </div>
            </div>
          )}

          {/* Tercero — solo para egresos y neutros */}
          {naturaleza !== 'ingreso' && (
            <div>
              <label style={lbl}>{terceroLabel}</label>
              <input type="text" style={inp} value={form.tercero}
                onChange={e => set('tercero', e.target.value)}
                placeholder={naturaleza === 'egreso' ? 'Nombre del proveedor externo' : 'Tercero'} />
              <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>
                Texto libre — nombre de empresa o persona externa.
              </div>
            </div>
          )}

          {/* Fecha vencimiento — aplica a Esperado y Facturado */}
          {(form.estado === 'esperado' || form.estado === 'facturado') && !isTransfer && (
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
                <option value="bono_fundador">🎁 Bono del fundador (30% utilidad)</option>
                <option value="anticipo_sueldo">Anticipo de sueldo</option>
                <option value="retiro_extraordinario">Retiro extraordinario</option>
                <option value="gasto_personal_empresa">Gasto personal en caja empresa</option>
              </select>
              {form.tipo_retiro === 'bono_fundador' && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: '#a855f7' }}>
                  Contará como bono en Nómina y entrará como Bonificación en tu mundo Personal.
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Notas (opcional)</label>
            <input type="text" style={inp} value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder="Observaciones, número de factura, etc." />
          </div>

          {/* Personal flag — solo para egresos. Marcar el checkbox y la categoría "Personal" son lo mismo. */}
          {!isTransfer && naturaleza === 'egreso' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.6rem 0.75rem', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
                <input type="checkbox" checked={form.personal_flag} onChange={e => {
                  const checked = e.target.checked;
                  setForm(f => ({
                    ...f,
                    personal_flag: checked,
                    categoria: checked && !f.categoria ? 'Personal' : (!checked && f.categoria === 'Personal' ? '' : f.categoria),
                  }));
                }}
                  style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }} />
                <span style={{ color: '#f59e0b', fontSize: '0.875rem', fontWeight: 600 }}>
                  ⚠️ Gasto personal pagado con caja empresa
                </span>
              </label>

              {form.personal_flag && founderStatus && (() => {
                const valorNum = Number(String(form.valor).replace(/\./g, '')) || 0;
                const fmtCop = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('es-CO');
                const despues = founderStatus.disponible - valorNum;
                const seExcede = despues < 0;
                return (
                  <div style={{
                    marginTop: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '8px',
                    background: seExcede ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.07)',
                    border: `1px solid ${seExcede ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)'}`,
                    fontSize: '0.78rem', color: seExcede ? '#ef4444' : '#10b981', lineHeight: 1.5,
                  }}>
                    Tuyo disponible esta quincena: <b>{fmtCop(founderStatus.disponible)}</b>
                    {valorNum > 0 && <> · después de este gasto: <b>{fmtCop(despues)}</b></>}
                    {seExcede && (
                      <div style={{ marginTop: '0.25rem', fontWeight: 700 }}>
                        🛑 Te estás pasando de tu salario. El exceso queda como deuda tuya con Impulsy y se descuenta de tu próximo pago de quincena.
                      </div>
                    )}
                  </div>
                );
              })()}
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
