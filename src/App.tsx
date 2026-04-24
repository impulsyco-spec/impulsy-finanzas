import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { seedBoldAccount } from './lib/seedBold';
import { Sidebar } from './components/Sidebar';
import { Dashboard }     from './pages/Dashboard';
import { Projects }      from './pages/Projects';
import { Payments }      from './pages/Payments';
import { Expirations }   from './pages/Expirations';
import { Login }         from './pages/Login';
import { Movimientos }   from './pages/Movimientos';
import { PorPagar }      from './pages/PorPagar';
import { Cuentas }       from './pages/Cuentas';
import { Deudas }        from './pages/Deudas';
import { Retiros }       from './pages/Retiros';
import { Rentabilidad }  from './pages/Rentabilidad';
import { ResumenAnual }  from './pages/ResumenAnual';
import { Alertas }       from './pages/Alertas';
import { Glosario }      from './pages/Glosario';
import {
  LayoutDashboard, FolderKanban, Wallet, Hourglass,
  BookOpen, Bell, LogOut,
} from 'lucide-react';
import './index.css';

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
      <div className="app-container">
        <Sidebar onLogout={handleLogout} />
        <main className="main-content">
          <Routes>
            {/* Cobros */}
            <Route path="/"            element={<Dashboard />} />
            <Route path="/projects"    element={<Projects />} />
            <Route path="/payments"    element={<Payments />} />
            <Route path="/expirations" element={<Expirations />} />
            {/* Finanzas */}
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/por-pagar"   element={<PorPagar />} />
            <Route path="/cuentas"     element={<Cuentas />} />
            <Route path="/deudas"      element={<Deudas />} />
            <Route path="/retiros"     element={<Retiros />} />
            {/* Análisis */}
            <Route path="/resumen-anual" element={<ResumenAnual />} />
            <Route path="/rentabilidad"  element={<Rentabilidad />} />
            <Route path="/alertas"       element={<Alertas />} />
            {/* Sistema */}
            <Route path="/glosario"  element={<Glosario />} />
            <Route path="/settings"  element={<div style={{ padding: '2rem', color: 'white' }}>Configuración — próximamente</div>} />
          </Routes>
        </main>

        {/* Mobile bottom nav */}
        <nav className="mobile-nav">
          <NavLink to="/"            end className={({ isActive }) => isActive ? 'active' : ''}>
            <LayoutDashboard size={20} />Dashboard
          </NavLink>
          <NavLink to="/projects"    className={({ isActive }) => isActive ? 'active' : ''}>
            <FolderKanban size={20} />Proyectos
          </NavLink>
          <NavLink to="/payments"    className={({ isActive }) => isActive ? 'active' : ''}>
            <Wallet size={20} />Cobros
          </NavLink>
          <NavLink to="/movimientos" className={({ isActive }) => isActive ? 'active' : ''}>
            <BookOpen size={20} />Movs
          </NavLink>
          <NavLink to="/alertas"     className={({ isActive }) => isActive ? 'active' : ''}>
            <Bell size={20} />Alertas
          </NavLink>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', border: 'none', color: '#f56565', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: '0.2rem', fontSize: '0.65rem', fontWeight: 600 }}
          >
            <LogOut size={20} />Salir
          </button>
        </nav>
      </div>
    </Router>
  );
}

export default App;
