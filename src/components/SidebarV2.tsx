import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, FolderKanban, TrendingUp, BarChart2, HelpCircle, LogOut, Users } from 'lucide-react';

interface Props { onLogout?: () => void; }

export const SidebarV2: React.FC<Props> = ({ onLogout }) => {
  const link = (to: string, icon: React.ReactNode, label: string, sub?: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {icon}
        <span>{label}</span>
      </div>
      {sub && <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginLeft: '2rem', marginTop: '0.1rem' }}>{sub}</div>}
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/assets/logo.jpg" alt="Impulsy"
          style={{ width: '120px', height: 'auto', filter: 'invert(1) contrast(2)' }} />
      </div>

      <nav className="sidebar-nav" style={{ paddingBottom: '2rem', gap: '0.25rem' }}>

        <div className="sidebar-section-label">Principal</div>
        {link('/',          <Home         size={18} />, 'Hoy',       '¿Cómo estoy ahora?')}
        {link('/proyectos', <FolderKanban size={18} />, 'Proyectos y Clientes', 'Contratos, cobros y perfiles')}
        {link('/finanzas',  <TrendingUp   size={18} />, 'Finanzas',  'Movimientos y proyección')}
        {link('/equipo',    <Users        size={18} />, 'Equipo',    'Freelancers y proveedores')}
        {link('/resumen',   <BarChart2    size={18} />, 'Resumen',   'Año y alertas')}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div className="sidebar-section-label" style={{ marginTop: '1rem' }}>Sistema</div>
          {link('/glosario', <HelpCircle size={18} />, 'Glosario & Ayuda')}
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
