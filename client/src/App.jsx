import { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api, isAuthenticated, setToken, ENTERED_KEY } from './api';
import Sidebar from './components/Sidebar';
import Masthead from './components/Masthead';
import Colophon from './components/Colophon';
import Entrance from './components/Entrance';
import GusAssistant from './components/GusAssistant';
import JanePeek from './components/JanePeek';
import ClerkPeek from './components/ClerkPeek';
import RouteLoader from './components/RouteLoader';
import PageNotice from './components/PageNotice';
import { TOOLS, HIDDEN_ROUTES } from './tools/registry';
import Auth from './pages/Auth';
import ResetPassword from './pages/ResetPassword';
import { clearEdition, isPersonal } from './lib/edition';
import { initClicky } from './lib/clicky';

// Gus does not work every floor. The Reading Room is Jane's, The
// Accounts belongs to Marx and Friedman, who lean in as a pair, and
// the Rewrite Desk staffs its own clerk in the rail — nobody peeks.
function AssistantOnDuty({ user }) {
  const { pathname } = useLocation();
  if (pathname.startsWith('/research')) return <JanePeek />;
  if (pathname.startsWith('/finance')) return <ClerkPeek />;
  if (pathname.startsWith('/jobs')) return null;
  return (
    <GusAssistant user={user} onTicketsCreated={() => {
      window.dispatchEvent(new Event('gus-tickets-created'));
    }} />
  );
}

function App() {
  const [user, setUser] = useState(null);
  // nothing to check when there is no token, so do not set state to say so
  const [checking, setChecking] = useState(() => isAuthenticated());
  // Per-tab, so a refresh drops you back where you were instead of replaying
  // the entrance, while a genuinely new session still gets the ceremony.
  const [entered, setEntered] = useState(() => {
    try { return sessionStorage.getItem(ENTERED_KEY) === '1'; } catch { return false; }
  });
  const [exiting, setExiting] = useState(false);

  useEffect(() => initClicky(), []);

  useEffect(() => {
    if (!isAuthenticated()) return;
    api.getMe()
      .then(setUser)
      .catch((err) => {
        // a real 401 has already cleared the token inside request(); a
        // network blip must not throw away a perfectly good session
        if (!/session expired/i.test(err.message || '')) {
          console.error('Could not reach the front desk:', err);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = () => {
    setToken(null); // also clears the entrance flag
    clearEdition();
    setUser(null);
    setEntered(false);
    setExiting(false);
  };

  const handleEnter = () => {
    setExiting(true);
    setTimeout(() => {
      try { sessionStorage.setItem(ENTERED_KEY, '1'); } catch { /* private mode */ }
      setEntered(true);
    }, 500);
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
              <PageNotice />
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
