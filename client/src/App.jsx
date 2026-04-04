import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import ListView from './pages/ListView';
import TicketDetail from './pages/TicketDetail';
import CreateTicket from './pages/CreateTicket';
import Canvas from './pages/Canvas';

function App() {
  return (
    <Router>
      <div className="relative min-h-screen bg-white">
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
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
