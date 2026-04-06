import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { api, isAuthenticated, setToken } from './api';
import Sidebar from './components/Sidebar';
import SoundToggle from './components/SoundToggle';
import Entrance from './components/Entrance';
import GusAssistant from './components/GusAssistant';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import ListView from './pages/ListView';
import TicketDetail from './pages/TicketDetail';
import CreateTicket from './pages/CreateTicket';
import Canvas from './pages/Canvas';
import Auth from './pages/Auth';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio('/audio/soundtrack.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; };
  }, []);

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
    if (audioRef.current) { audioRef.current.pause(); setPlaying(false); }
  };

  const handleEnter = (withSound) => {
    if (withSound && audioRef.current) {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
    setExiting(true);
    setTimeout(() => setEntered(true), 500);
  };

  const toggleSound = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play().catch(() => {}); }
    setPlaying(!playing);
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
          <SoundToggle playing={playing} onToggle={toggleSound} />
          <Sidebar user={user} onLogout={handleLogout} />
          <main className="flex-1 ml-[220px] px-10 py-8 overflow-auto flex flex-col min-h-screen">
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/board" element={<Board />} />
                <Route path="/list" element={<ListView />} />
                <Route path="/tickets/new" element={<CreateTicket />} />
                <Route path="/tickets/:id" element={<TicketDetail />} />
                <Route path="/canvas" element={<Canvas />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </div>
            <footer className="py-6 text-center t-label tracking-[0.2em]">
              Made by Khush
            </footer>
          </main>
          <GusAssistant onTicketsCreated={() => {
            // Dispatch event so any active page can refresh its data
            window.dispatchEvent(new Event('gus-tickets-created'));
          }} />
        </div>
      </div>
    </Router>
  );
}

export default App;
