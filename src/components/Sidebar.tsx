import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Wallet, Hourglass, Settings, LogOut,
  BookOpen, CreditCard, Building2, Link2, UserMinus, BarChart3, Bell, CalendarDays, HelpCircle,
} from 'lucide-react';

interface SidebarProps {
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const link = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
    >
      {icon}
      {label}
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img
          src="/assets/logo.jpg"
          alt="Impulsy"
          style={{ width: '120px', height: 'auto', filter: 'invert(1) contrast(2)' }}
        />
      </div>

      <nav className="sidebar-nav" style={{ paddingBottom: '2rem' }}>

        {/* ── COBROS ─────────────────────────────────── */}
        <div className="sidebar-section-label">Cobros</div>
        {link('/',            <LayoutDashboard size={18} />, 'Dashboard')}
        {link('/projects',    <FolderKanban    size={18} />, 'Proyectos')}
        {link('/payments',    <Wallet          size={18} />, 'Por Cobrar')}
        {link('/expirations', <Hourglass       size={18} />, 'Vigencias')}

        {/* ── FINANZAS ───────────────────────────────── */}
        <div className="sidebar-section-label" style={{ marginTop: '1rem' }}>Finanzas</div>
        {link('/movimientos', <BookOpen     size={18} />, 'Movimientos')}
        {link('/por-pagar',   <CreditCard   size={18} />, 'Por Pagar')}
        {link('/cuentas',     <Building2    size={18} />, 'Cuentas')}
        {link('/deudas',      <Link2        size={18} />, 'Deudas')}
        {link('/retiros',     <UserMinus    size={18} />, 'Retiros')}

        {/* ── ANÁLISIS ──────────────────────────────── */}
        <div className="sidebar-section-label" style={{ marginTop: '1rem' }}>Análisis</div>
        {link('/resumen-anual', <CalendarDays size={18} />, 'Resumen Anual')}
        {link('/rentabilidad',  <BarChart3    size={18} />, 'Rentabilidad')}
        {link('/alertas',       <Bell         size={18} />, 'Alertas')}

        {/* ── SISTEMA ───────────────────────────────── */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div className="sidebar-section-label" style={{ marginTop: '1rem' }}>Sistema</div>
          {link('/glosario',  <HelpCircle size={18} />, 'Glosario & Ayuda')}
          {link('/settings',  <Settings   size={18} />, 'Configuración')}
          {onLogout && (
            <button
              onClick={onLogout}
              className="nav-link"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f56565', width: '100%', textAlign: 'left' }}
            >
              <LogOut size={18} />
              Cerrar Sesión
            </button>
          )}
        </div>
      </nav>
    </aside>
  );
};
