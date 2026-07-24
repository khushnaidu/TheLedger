import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, Folder } from 'lucide-react';
import { PRIORITY_CONFIG } from '../constants';

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');

export default function TicketCard({ ticket, isDragging }) {
  const navigate = useNavigate();
  const priority = PRIORITY_CONFIG[ticket.priority];
  const isDone = ticket.status === 'DONE';
  const daysLeft = ticket.dueDate
    ? Math.ceil((new Date(ticket.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0 && !isDone;
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2 && !isDone;
  const isCritical = ticket.priority === 'CRITICAL' && !isDone;

  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className={`panel p-3 cursor-pointer bg-white ${isDragging ? 'shadow-[3px_3px_0_#000]' : ''} ${isDone ? 'opacity-50' : ''}`}
      style={isCritical ? { borderColor: 'var(--stamp)' } : {}}
    >
      {/* Top meta line */}
      <div className="meta-strip justify-between mb-2" style={{ gap: '4px 8px' }}>
        {isDone ? (
          <span className="meta-item">
            <CheckCircle /> Filed
          </span>
        ) : (
          <span className="meta-item" style={isCritical ? { color: 'var(--stamp)' } : {}}>
            PRI · {priority.label}
          </span>
        )}
        {ticket.category && (
          <span className="meta-item">
            <Folder /> {ticket.category.name}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className={`entry-title text-[0.8125rem] mb-1.5 ${isDone ? 'line-through' : ''}`}>
        {ticket.title}
      </h3>

      {/* Labels */}
      {ticket.labels?.length > 0 && (
        <div className="mb-1">
          {ticket.labels.map((label) => (
            <span key={label.id} className="tag-box tag-box-mute">
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Bottom meta line */}
      {ticket.dueDate && (
        <div className={`meta-strip mt-1.5 ${isOverdue || isDueSoon ? 'text-[var(--stamp)]' : ''}`}
          style={isOverdue || isDueSoon ? { color: 'var(--stamp)' } : {}}>
          <span className="meta-item">
            <Clock /> {fmt(ticket.dueDate)}
          </span>
          {isOverdue && <span className="stamp stamp-red text-[0.4375rem] py-0 px-1">Late</span>}
          {isDueSoon && !isOverdue && (
            <span className="stamp stamp-red text-[0.4375rem] py-0 px-1">
              {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
