import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { STATUSES, STATUS_CONFIG } from '../constants';
import TicketCard from '../components/TicketCard';
import UndoToast from '../components/UndoToast';

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
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { id, ticket }
  const undoRef = useRef(null);

  const fetchTickets = () => {
    api.getTickets({ sortBy: 'urgency' })
      .then(setTickets).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(); }, []);

  const columns = STATUSES.reduce((acc, s) => {
    acc[s] = tickets
      .filter((t) => t.status === s && t.id !== pendingDelete?.id)
      .sort((a, b) => urgencyScore(a) - urgencyScore(b));
    return acc;
  }, {});

  const handleDragStart = () => setDragging(true);

  const handleDragEnd = async (result) => {
    setDragging(false);

    if (!result.destination) return;
    const { draggableId, destination } = result;

    // Dropped on trash
    if (destination.droppableId === 'TRASH') {
      const ticket = tickets.find((t) => t.id === draggableId);
      setDeletingId(draggableId);
      setTimeout(() => {
        setDeletingId(null);
        setPendingDelete({ id: draggableId, ticket });
      }, 400);
      return;
    }

    // Normal column move
    setTickets((prev) => prev.map((t) => t.id === draggableId ? { ...t, status: destination.droppableId, order: destination.index } : t));
    try { await api.moveTicket(draggableId, { status: destination.droppableId, order: destination.index }); } catch { fetchTickets(); }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setPendingDelete(null);
    try { await api.deleteTicket(id); } catch { fetchTickets(); }
  };

  const undoDelete = () => {
    setPendingDelete(null);
    // Ticket is still in the tickets array, just hidden — removing pendingDelete shows it again
  };

  if (loading) return (
    <div>
      <div className="rule-8 mb-20" />
      <div className="flex flex-col items-center justify-center py-32">
        <div className="loader mb-6"><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /><div className="loader-bar" /></div>
        <p className="t-label">Loading board...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-full">
      <div className="rule-8 mb-16" />
      <p className="t-label mb-6">Workflow</p>
      <h1 className="t-display text-[2.5rem] mb-16">Board</h1>

      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                          {(prov, snap) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                              className={deletingId === ticket.id ? 'trash-crumple' : ''}>
                              <TicketCard ticket={ticket} isDragging={snap.isDragging} />
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

        {/* Trash drop zone */}
        <div className={`fixed bottom-0 left-[220px] right-0 z-40 flex justify-center transition-all duration-300 ${
          dragging ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}>
          <Droppable droppableId="TRASH">
            {(provided, snapshot) => {
              const isOver = snapshot.isDraggingOver;
              return (
                <div ref={provided.innerRef} {...provided.droppableProps}
                  className={`w-full flex items-center justify-center gap-3 py-6 transition-all duration-150 ${
                    isOver ? 'bg-[var(--stamp)] text-white' : 'bg-black text-white'
                  }`}>
                  <Trash2 className={`w-4 h-4 transition-transform duration-150 ${isOver ? 'scale-125' : ''}`} />
                  <span className="text-[0.625rem] tracking-[0.14em] uppercase">
                    {isOver ? 'Release to delete' : 'Drag here to delete'}
                  </span>
                  <div className="hidden">{provided.placeholder}</div>
                </div>
              );
            }}
          </Droppable>
        </div>
      </DragDropContext>

      {/* Undo toast */}
      {pendingDelete && (
        <UndoToast
          message={`"${pendingDelete.ticket.title}" deleted`}
          onUndo={undoDelete}
          onExpire={confirmDelete}
        />
      )}

      <div className="rule mt-16 mb-10" />
    </div>
  );
}
