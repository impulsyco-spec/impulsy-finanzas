import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { seedBoldAccount } from './lib/seedBold';

// ── V2 (piloto) ──────────────────────────────────────────
import { SidebarV2 }    from './components/SidebarV2';
import { Inicio }       from './pages/v2/Inicio';
import { ProyectosV2 }  from './pages/v2/ProyectosV2';
import { Adquisicion }  from './pages/v2/Adquisicion';
import { Nomina }       from './pages/v2/Nomina';
import { Productividad } from './pages/v2/Productividad';
import { Finanzas }     from './pages/v2/Finanzas';
import { Resumen }      from './pages/v2/Resumen';
import { Equipo }       from './pages/v2/Equipo';

// ── Mundo Personal (interruptor de mundos) ───────────────
import { SidebarPersonal }    from './components/SidebarPersonal';
import { PersonalHoy }        from './pages/v2/personal/Hoy';
import { PersonalDistribuir } from './pages/v2/personal/Distribuir';
import { PersonalMovimientos } from './pages/v2/personal/Movimientos';
import { PersonalProyeccion } from './pages/v2/personal/Proyeccion';
import { PersonalBolsillos }  from './pages/v2/personal/Bolsillos';
import { PersonalDeudas }     from './pages/v2/personal/Deudas';
import { PersonalResumen }    from './pages/v2/personal/Resumen';

// ── Páginas compartidas (no cambian) ─────────────────────
import { Login }         from './pages/Login';
import { Glosario }      from './pages/Glosario';

// ── Páginas v1 (siguen existiendo en sus rutas) ──────────
import { Dashboard }     from './pages/Dashboard';
import { Projects }      from './pages/Projects';
import { Payments }      from './pages/Payments';
import { Expirations }   from './pages/Expirations';
import { Movimientos }   from './pages/Movimientos';
import { PorPagar }      from './pages/PorPagar';
import { Cuentas }       from './pages/Cuentas';
import { Deudas }        from './pages/Deudas';
import { Retiros }       from './pages/Retiros';
import { Rentabilidad }  from './pages/Rentabilidad';
import { ResumenAnual }  from './pages/ResumenAnual';
import { Alertas }       from './pages/Alertas';

import { FinancialAdvisor } from './components/FinancialAdvisor';
import { Home, FolderKanban, TrendingUp, BarChart2, LogOut, UserCircle, NotebookPen, Target, CreditCard, ArrowLeftRight } from 'lucide-react';
import './index.css';

const GOLD = '#f59e0b';

// El "mundo" activo se deriva de la ruta: /personal/* = mundo Personal
function Shell({ onLogout }: { onLogout: () => void }) {
  const { pathname } = useLocation();
  const esPersonal = pathname.startsWith('/personal');

  return (
    <div className="app-container">
      {esPersonal ? <SidebarPersonal onLogout={onLogout} /> : <SidebarV2 onLogout={onLogout} />}

      <main className="main-content">
        <Routes>
          {/* ── Mundo Impulsy ── */}
          <Route path="/"          element={<Inicio />} />
          <Route path="/proyectos" element={<ProyectosV2 />} />
          <Route path="/clientes"  element={<ProyectosV2 />} />
          <Route path="/adquisicion" element={<Adquisicion />} />
          <Route path="/nomina"    element={<Nomina />} />
          <Route path="/productividad" element={<Productividad />} />
          <Route path="/finanzas"  element={<Finanzas />} />
          <Route path="/equipo"    element={<Equipo />} />
          <Route path="/resumen"   element={<Resumen />} />

          {/* ── Mundo Personal ── */}
          <Route path="/personal"             element={<PersonalHoy />} />
          <Route path="/personal/distribuir"  element={<PersonalDistribuir />} />
          <Route path="/personal/movimientos" element={<PersonalMovimientos />} />
          <Route path="/personal/proyeccion"  element={<PersonalProyeccion />} />
          <Route path="/personal/bolsillos"   element={<PersonalBolsillos />} />
          <Route path="/personal/deudas"      element={<PersonalDeudas />} />
          <Route path="/personal/resumen"     element={<PersonalResumen />} />

          {/* ── Compartidas ── */}
          <Route path="/glosario"  element={<Glosario />} />

          {/* ── V1 (accesibles por URL directa, sin menú) ── */}
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/projects"     element={<Projects />} />
          <Route path="/payments"     element={<Payments />} />
          <Route path="/expirations"  element={<Expirations />} />
          <Route path="/movimientos"  element={<Movimientos />} />
          <Route path="/por-pagar"    element={<PorPagar />} />
          <Route path="/cuentas"      element={<Cuentas />} />
          <Route path="/deudas"       element={<Deudas />} />
          <Route path="/retiros"      element={<Retiros />} />
          <Route path="/rentabilidad" element={<Rentabilidad />} />
          <Route path="/resumen-anual" element={<ResumenAnual />} />
          <Route path="/alertas"      element={<Alertas />} />
        </Routes>
      </main>

      {/* El asesor IA del negocio solo vive en el mundo Impulsy */}
      {!esPersonal && <FinancialAdvisor />}

      {/* Nav móvil — cambia con el mundo */}
      {esPersonal ? (
        <nav className="mobile-nav" style={{ borderTop: `1px solid ${GOLD}33` }}>
          <NavLink to="/personal" end className={({ isActive }) => isActive ? 'active' : ''} style={{ color: GOLD }}>
            <Home size={20} />Hoy
          </NavLink>
          <NavLink to="/personal/movimientos" className={({ isActive }) => isActive ? 'active' : ''} style={{ color: GOLD }}>
            <NotebookPen size={20} />Registro
          </NavLink>
          <NavLink to="/personal/bolsillos" className={({ isActive }) => isActive ? 'active' : ''} style={{ color: GOLD }}>
            <Target size={20} />Metas
          </NavLink>
          <NavLink to="/personal/deudas" className={({ isActive }) => isActive ? 'active' : ''} style={{ color: GOLD }}>
            <CreditCard size={20} />Deudas
          </NavLink>
          <NavLink to="/personal/resumen" className={({ isActive }) => isActive ? 'active' : ''} style={{ color: GOLD }}>
            <BarChart2 size={20} />Resumen
          </NavLink>
          <NavLink to="/" style={{ color: '#a0aec0' }}>
            <ArrowLeftRight size={20} />Impulsy
          </NavLink>
        </nav>
      ) : (
        <nav className="mobile-nav">
          <NavLink to="/"          end className={({ isActive }) => isActive ? 'active' : ''}>
            <Home size={20} />Hoy
          </NavLink>
          <NavLink to="/proyectos" className={({ isActive }) => isActive ? 'active' : ''}>
            <FolderKanban size={20} />Proyectos
          </NavLink>
          <NavLink to="/finanzas"  className={({ isActive }) => isActive ? 'active' : ''}>
            <TrendingUp size={20} />Finanzas
          </NavLink>
          <NavLink to="/resumen"   className={({ isActive }) => isActive ? 'active' : ''}>
            <BarChart2 size={20} />Resumen
          </NavLink>
          <NavLink to="/personal"  style={{ color: GOLD }}>
            <UserCircle size={20} />Personal
          </NavLink>
          <button onClick={onLogout}
            style={{ background: 'transparent', border: 'none', color: '#f56565', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: '0.2rem', fontSize: '0.65rem', fontWeight: 600 }}>
            <LogOut size={20} />Salir
          </button>
        </nav>
      )}
    </div>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('impulsy_auth') === 'true') {
      setIsLoggedIn(true);
      seedBoldAccount();
    }
  }, []);

  const handleLogin  = () => { localStorage.setItem('impulsy_auth', 'true'); setIsLoggedIn(true); };
  const handleLogout = () => { localStorage.removeItem('impulsy_auth'); setIsLoggedIn(false); };

  if (!isLoggedIn) return <Login onLogin={handleLogin} />;

  return (
    <Router>
      <Shell onLogout={handleLogout} />
    </Router>
  );
}

export default App;
