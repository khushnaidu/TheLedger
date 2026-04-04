import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { api, isAuthenticated, setToken } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import ListView from './pages/ListView';
import TicketDetail from './pages/TicketDetail';
import CreateTicket from './pages/CreateTicket';
import Canvas from './pages/Canvas';
import Auth from './pages/Auth';
import SoundToggle from './components/SoundToggle';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isAuthenticated()) {
      api.getMe()
        .then(setUser)
        .catch(() => setToken(null))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = () => {
    setToken(null);
    setUser(null);
  };

  if (checking) return null;

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="*" element={<Auth onLogin={handleLogin} />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <div className="relative min-h-screen bg-white">
        <div className="relative z-10 flex min-h-screen">
          <SoundToggle />
          <Sidebar user={user} onLogout={handleLogout} />
          <main className="flex-1 ml-[220px] px-10 py-8 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/board" element={<Board />} />
              <Route path="/list" element={<ListView />} />
              <Route path="/tickets/new" element={<CreateTicket />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/canvas" element={<Canvas />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
