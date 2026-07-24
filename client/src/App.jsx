import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { api, isAuthenticated, setToken } from './api';
import Sidebar from './components/Sidebar';
import Masthead from './components/Masthead';
import Colophon from './components/Colophon';
import Entrance from './components/Entrance';
import GusAssistant from './components/GusAssistant';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import ListView from './pages/ListView';
import TicketDetail from './pages/TicketDetail';
import CreateTicket from './pages/CreateTicket';
import Auth from './pages/Auth';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

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
    setEntered(false);
    setExiting(false);
  };

  const handleEnter = () => {
    setExiting(true);
    setTimeout(() => setEntered(true), 500);
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

  // Show entrance screen before entering the app
  if (!entered) {
    return (
      <div className={exiting ? 'entrance-exit' : ''}>
        <Entrance userName={user.name} onEnter={handleEnter} />
      </div>
    );
  }

  return (
    <Router>
        <div className="relative min-h-screen bg-white">
          <div className="relative z-10 flex min-h-screen">
            <Sidebar user={user} onLogout={handleLogout} />
            <main className="flex-1 ml-[220px] px-10 py-6 overflow-y-auto overflow-x-clip flex flex-col min-h-screen">
              <Masthead />
              <div className="flex-1">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/board" element={<Board />} />
                  <Route path="/list" element={<ListView />} />
                  <Route path="/tickets/new" element={<CreateTicket />} />
                  <Route path="/tickets/:id" element={<TicketDetail />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </div>
              <footer className="pt-10 pb-4">
                <Colophon />
              </footer>
            </main>
            <GusAssistant onTicketsCreated={() => {
              window.dispatchEvent(new Event('gus-tickets-created'));
            }} />
          </div>
        </div>
    </Router>
  );
}

export default App;
