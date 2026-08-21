import { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api, isAuthenticated, setToken } from './api';
import Sidebar from './components/Sidebar';
import Masthead from './components/Masthead';
import Colophon from './components/Colophon';
import Entrance from './components/Entrance';
import GusAssistant from './components/GusAssistant';
import JanePeek from './components/JanePeek';
import RouteLoader from './components/RouteLoader';
import { TOOLS, HIDDEN_ROUTES } from './tools/registry';
import Auth from './pages/Auth';
import ResetPassword from './pages/ResetPassword';
import { clearEdition, isPersonal } from './lib/edition';
import { initClicky } from './lib/clicky';

// The Reading Room is Jane's turf — Gus stays out of it
function AssistantOnDuty({ user }) {
  const { pathname } = useLocation();
  if (pathname.startsWith('/research')) return <JanePeek />;
  return (
    <GusAssistant user={user} onTicketsCreated={() => {
      window.dispatchEvent(new Event('gus-tickets-created'));
    }} />
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => initClicky(), []);

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
    clearEdition();
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
          <Route path="/reset" element={<ResetPassword onLogin={handleLogin} />} />
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
                <Suspense fallback={<RouteLoader />}>
                  <Routes>
                    {TOOLS.filter((t) => !t.personalOnly || isPersonal()).map((tool) => (
                      <Route key={tool.route} path={tool.route} element={<tool.Component />} />
                    ))}
                    {HIDDEN_ROUTES.map((tool) => (
                      <Route key={tool.route} path={tool.route} element={<tool.Component />} />
                    ))}
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </Suspense>
              </div>
              <footer className="pt-10 pb-4">
                <Colophon />
              </footer>
            </main>
            <AssistantOnDuty user={user} />
          </div>
        </div>
    </Router>
  );
}

export default App;
