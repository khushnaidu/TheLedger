import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { PRIORITY_CONFIG } from '../constants';

export default function TicketCard({ ticket, isDragging }) {
  const navigate = useNavigate();
  const priority = PRIORITY_CONFIG[ticket.priority];
  const daysLeft = ticket.dueDate
    ? Math.ceil((new Date(ticket.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0 && ticket.status !== 'DONE';
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2 && ticket.status !== 'DONE';
  const isCritical = ticket.priority === 'CRITICAL';

  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className={`panel p-5 cursor-pointer bg-white ${isDragging ? 'shadow-[4px_4px_0_#000] -translate-x-0.5 -translate-y-0.5' : ''}`}
      style={isCritical ? { borderColor: 'var(--stamp)' } : {}}
    >
      {/* Meta */}
      <div className="flex items-center justify-between mb-3">
        <span className="t-label" style={{ color: isCritical ? 'var(--stamp)' : undefined }}>
          {priority.label}
        </span>
        {ticket.category && (
          <span className="t-label">{ticket.category.name}</span>
        )}
      </div>

      {/* Title */}
      <h3 className="t-heading text-[0.75rem] mb-2">{ticket.title}</h3>

      {/* Labels */}
      {ticket.labels?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ticket.labels.map((label) => (
            <span key={label.id} className="t-label" style={{ color: 'var(--ink-30)' }}>
              [{label.name}]
            </span>
          ))}
        </div>
      )}

      {/* Due */}
      {ticket.dueDate && (
        <div className={`flex items-center gap-1.5 mt-3 t-small ${isOverdue || isDueSoon ? 'text-[var(--stamp)]' : ''}`}>
          <Clock className="w-2.5 h-2.5" />
          {new Date(ticket.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {isOverdue && <span className="stamp stamp-red text-[0.4375rem] py-0 px-1 ml-1">Late</span>}
          {isDueSoon && !isOverdue && <span className="stamp stamp-red text-[0.4375rem] py-0 px-1 ml-1">{daysLeft === 0 ? 'Today' : `${daysLeft}d`}</span>}
        </div>
      )}
    </div>
  );
}
