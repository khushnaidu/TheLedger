import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from '../api';
import { STATUSES, STATUS_CONFIG } from '../constants';
import TicketCard from '../components/TicketCard';

// Client-side urgency sort (mirrors server logic)
function urgencyScore(ticket) {
  if (!ticket.dueDate) {
    const w = { CRITICAL: 100, HIGH: 200, MEDIUM: 300, LOW: 400 };
    return w[ticket.priority] || 350;
  }
  return (new Date(ticket.dueDate) - new Date()) / (1000 * 60 * 60);
}

export default function Board() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = () => {
    api.getTickets({ sortBy: 'urgency' })
      .then(setTickets).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(); }, []);

  const columns = STATUSES.reduce((acc, s) => {
    acc[s] = tickets
      .filter((t) => t.status === s)
      .sort((a, b) => urgencyScore(a) - urgencyScore(b));
    return acc;
  }, {});

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    setTickets((prev) => prev.map((t) => t.id === draggableId ? { ...t, status: destination.droppableId, order: destination.index } : t));
    try { await api.moveTicket(draggableId, { status: destination.droppableId, order: destination.index }); } catch { fetchTickets(); }
  };

  if (loading) return <div className="rule-8 mb-20" />;

  return (
    <div className="max-w-full">
      <div className="rule-8 mb-16" />
      <p className="t-label mb-6">Workflow</p>
      <h1 className="t-display text-[2.5rem] mb-16">Board</h1>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-6 overflow-x-auto pb-8">
          {STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            const colTickets = columns[status] || [];
            const isActive = status === 'IN_PROGRESS';

            return (
              <div key={status} className="flex-shrink-0 w-[240px]">
                <div className={`mb-6 ${isActive ? 'rule-4' : 'rule-2'}`} style={isActive ? { background: 'var(--stamp)' } : {}} />
                <div className="flex items-center justify-between mb-6">
                  <span className={`t-label ${isActive ? 'text-[var(--stamp)]' : ''}`}>{config.label}</span>
                  <span className="t-small">{colTickets.length}</span>
                </div>

                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`space-y-3 min-h-[200px] transition-colors ${snapshot.isDraggingOver ? 'bg-[var(--ink-04)] p-2 -m-2' : ''}`}>
                      {colTickets.map((ticket, index) => (
                        <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                              <TicketCard ticket={ticket} isDragging={snapshot.isDragging} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {colTickets.length === 0 && !snapshot.isDraggingOver && (
                        <div className="pt-6 text-center">
                          <img src="/art/couchrandom.jpg" alt="" className="w-[70px] mx-auto mix-blend-multiply opacity-90 mb-2" />
                          <span className="t-small">Empty</span>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <div className="rule mt-16 mb-10" />
    </div>
  );
}
