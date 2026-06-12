import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, NotebookPen, TrendingUp, Target, CreditCard, BarChart2, LogOut, ArrowLeftRight } from 'lucide-react';

interface Props { onLogout?: () => void; }

const GOLD = '#f59e0b';

// Menú del MUNDO PERSONAL — espejo dorado del de Impulsy
export const SidebarPersonal: React.FC<Props> = ({ onLogout }) => {
  const navigate = useNavigate();

  const link = (to: string, icon: React.ReactNode, label: string, sub?: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      style={({ isActive }) => ({
        flexDirection: 'column', alignItems: 'flex-start', gap: '0', padding: '0.75rem 1rem',
        color: isActive ? GOLD : undefined,
      })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {icon}
        <span>{label}</span>
      </div>
      {sub && <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginLeft: '2rem', marginTop: '0.1rem' }}>{sub}</div>}
    </NavLink>
  );

  return (
    <aside className="sidebar" style={{ borderRight: `1px solid ${GOLD}22` }}>
      <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: GOLD }}>👤 Personal</div>
        <button onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#111', color: '#a0aec0', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
          <ArrowLeftRight size={13} /> Cambiar a Impulsy
        </button>
      </div>

      <nav className="sidebar-nav" style={{ paddingBottom: '2rem', gap: '0.25rem' }}>
        <div className="sidebar-section-label" style={{ color: GOLD }}>Mi mundo</div>
        {link('/personal',             <Home        size={18} />, 'Hoy',               '¿Cómo estoy?', true)}
        {link('/personal/movimientos', <NotebookPen size={18} />, 'Movimientos',       'Registro diario')}
        {link('/personal/proyeccion',  <TrendingUp  size={18} />, 'Proyección',        'Fijos y presupuesto')}
        {link('/personal/bolsillos',   <Target      size={18} />, 'Bolsillos y Metas', 'Aparta y cumple')}
        {link('/personal/deudas',      <CreditCard  size={18} />, 'Deudas',            'Tarjetas y préstamos')}
        {link('/personal/resumen',     <BarChart2   size={18} />, 'Resumen',           'Tu año personal')}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {onLogout && (
            <button onClick={onLogout} className="nav-link"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f56565', width: '100%', textAlign: 'left' }}>
              <LogOut size={18} /> Cerrar Sesión
            </button>
          )}
        </div>
      </nav>
    </aside>
  );
};
