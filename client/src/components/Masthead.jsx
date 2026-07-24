import { useState, useEffect } from 'react';
import { api } from '../api';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Masthead() {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    const load = () => api.getTickets({}).then(setTickets).catch(() => {});
    load();
    window.addEventListener('gus-tickets-created', load);
    return () => window.removeEventListener('gus-tickets-created', load);
  }, []);

  const open = tickets.filter((t) => t.status !== 'DONE');
  const today = startOfDay(new Date());
  const overdue = open.filter((t) => t.dueDate && startOfDay(t.dueDate) < today).length;
  const dueToday = open.filter((t) => t.dueDate && startOfDay(t.dueDate).getTime() === today.getTime()).length;

  const dateLine = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const segments = [
    dateLine,
    `${String(open.length).padStart(4, '0')} open`,
    overdue > 0 ? `${String(overdue).padStart(2, '0')} overdue` : 'nothing overdue',
    dueToday > 0 ? `${String(dueToday).padStart(2, '0')} due today` : 'clear skies today',
    'not quite a ledger, not really a task manager, certainly not another productivity app',
    'fig. cuties.png — the reason',
    'every entry accounted for',
    'bourdain.gif — patron saint of showing up',
    'peace and nothing else',
    'fire.gif — where deleted entries go',
  ];

  return (
    <div className="masthead">
      <div className="masthead-tagline">
        <div className="marquee-track">
          {[0, 1].map((n) => (
            <span key={n}>{segments.join(' — ')}{' — '}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
