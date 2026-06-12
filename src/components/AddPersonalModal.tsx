import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CATS_PERSONAL_EGRESO, CATS_PERSONAL_INGRESO, PersonalMovement } from '../hooks/usePersonal';
import { GOLD, inp, lbl, fmtInput } from '../pages/v2/personal/comunes';
import { hoyISO } from '../lib/dates';

interface Props {
  onClose: () => void;
  onSave: (m: { fecha: string; naturaleza: 'ingreso' | 'egreso'; descripcion: string; valor: number; categoria?: string; estado: 'confirmado' | 'esperado'; notas?: string }) => Promise<void>;
  editing?: PersonalMovement | null;
}

export const AddPersonalModal: React.FC<Props> = ({ onClose, onSave, editing }) => {
  const [f, setF] = useState({
    naturaleza: 'egreso' as 'ingreso' | 'egreso',
    fecha: hoyISO(), descripcion: '', valor: '',
    categoria: 'Ocio', estado: 'confirmado' as 'confirmado' | 'esperado', notas: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setF({
        naturaleza: editing.naturaleza, fecha: editing.fecha, descripcion: editing.descripcion,
        valor: String(Math.round(editing.valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
        categoria: editing.categoria || 'Ocio', estado: editing.estado, notas: editing.notas || '',
      });
    }
  }, [editing]);

  const cats = f.naturaleza === 'egreso' ? CATS_PERSONAL_EGRESO : CATS_PERSONAL_INGRESO;
  const color = f.naturaleza === 'ingreso' ? '#10b981' : GOLD;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div className="card" style={{ width: '480px', maxWidth: '100%', border: `1px solid ${GOLD}44` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ color, fontWeight: 800, fontSize: '1.1rem' }}>
            {editing ? 'Editar movimiento' : f.naturaleza === 'ingreso' ? '↑ Ingreso Personal' : '↓ Gasto Personal'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', background: '#111', padding: '0.25rem', borderRadius: '10px' }}>
            {(['egreso', 'ingreso'] as const).map(n => (
              <button key={n} onClick={() => setF(x => ({ ...x, naturaleza: n, categoria: n === 'egreso' ? 'Ocio' : 'Salario Impulsy' }))}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', background: f.naturaleza === n ? (n === 'ingreso' ? '#10b981' : GOLD) : 'transparent', color: f.naturaleza === n ? '#000' : '#71717a' }}>
                {n === 'egreso' ? '↓ Gasto' : '↑ Ingreso'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <div><label style={lbl}>Fecha *</label><input type="date" style={inp} value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value }))} /></div>
            <div><label style={lbl}>Valor COP *</label>
              <input inputMode="numeric" style={{ ...inp, color, fontWeight: 700, fontSize: '1rem' }} value={f.valor}
                onChange={e => setF(x => ({ ...x, valor: fmtInput(e.target.value) }))} placeholder="0" />
            </div>
          </div>

          <div><label style={lbl}>Descripción *</label>
            <input style={inp} value={f.descripcion} onChange={e => setF(x => ({ ...x, descripcion: e.target.value }))}
              placeholder={f.naturaleza === 'egreso' ? 'Ej. Mercado de la semana' : 'Ej. Bonificación trimestral'} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <div><label style={lbl}>Categoría</label>
              <select style={inp} value={f.categoria} onChange={e => setF(x => ({ ...x, categoria: e.target.value }))}>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Estado</label>
              <select style={inp} value={f.estado} onChange={e => setF(x => ({ ...x, estado: e.target.value as any }))}>
                <option value="confirmado">{f.naturaleza === 'egreso' ? 'Pagado — Ya salió' : 'Recibido — Ya entró'}</option>
                <option value="esperado">Proyectado — Aún no</option>
              </select>
            </div>
          </div>

          <div><label style={lbl}>Notas (opcional)</label>
            <input style={inp} value={f.notas} onChange={e => setF(x => ({ ...x, notas: e.target.value }))} placeholder="Observaciones" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #222' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button disabled={saving} className="btn btn-primary"
            onClick={async () => {
              const valor = Number(f.valor.replace(/\./g, ''));
              if (!f.fecha || !f.descripcion.trim() || valor <= 0) { alert('Completa fecha, descripción y valor.'); return; }
              setSaving(true);
              try {
                await onSave({ fecha: f.fecha, naturaleza: f.naturaleza, descripcion: f.descripcion.trim(), valor, categoria: f.categoria, estado: f.estado, notas: f.notas.trim() || undefined });
              } catch (err: any) { alert('Error: ' + err.message); }
              finally { setSaving(false); }
            }}>
            {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
};
