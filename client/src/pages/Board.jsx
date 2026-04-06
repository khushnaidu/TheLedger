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

  // Refresh when Gus creates tickets
  useEffect(() => {
    const handler = () => fetchTickets();
    window.addEventListener('gus-tickets-created', handler);
    return () => window.removeEventListener('gus-tickets-created', handler);
  }, []);

  // Auto-hide done tickets older than 3 days from the board
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const columns = STATUSES.reduce((acc, s) => {
    acc[s] = tickets
      .filter((t) => {
        if (t.id === pendingDelete?.id) return false;
        if (t.status !== s) return false;
        // Hide stale done tickets from board (they stay in archive)
        if (s === 'DONE' && new Date(t.updatedAt) < threeDaysAgo) return false;
        return true;
      })
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
        {/* Columns — fixed height, internal scroll */}
        <div className="flex gap-6 overflow-x-auto" style={{ height: 'calc(100vh - 240px)' }}>
          {STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            const colTickets = columns[status] || [];
            const isActive = status === 'IN_PROGRESS';

            return (
              <div key={status} className="flex-shrink-0 w-[240px] flex flex-col">
                <div className={`mb-6 ${isActive ? 'rule-4' : 'rule-2'}`} style={isActive ? { background: 'var(--stamp)' } : {}} />
                <div className="flex items-center justify-between mb-6">
                  <span className={`t-label ${isActive ? 'text-[var(--stamp)]' : ''}`}>{config.label}</span>
                  <span className="t-small">{colTickets.length}</span>
                </div>

                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`space-y-3 flex-1 overflow-y-auto pr-1 transition-colors ${snapshot.isDraggingOver ? 'bg-[var(--ink-04)] p-2 -m-2' : ''}`}>
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

        {/* Trash bar — slides open below columns when dragging */}
        <div className={`transition-all duration-200 overflow-hidden ${
          dragging ? 'max-h-[60px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}>
          <Droppable droppableId="TRASH">
            {(provided, snapshot) => {
              const isOver = snapshot.isDraggingOver;
              return (
                <div ref={provided.innerRef} {...provided.droppableProps}
                  className={`flex items-center justify-center gap-3 py-4 border-2 border-dashed transition-all duration-150 ${
                    isOver
                      ? 'border-[var(--stamp)] bg-[var(--stamp)] text-white'
                      : 'border-[var(--ink-15)]'
                  }`}>
                  <Trash2 className={`w-4 h-4 transition-transform duration-150 ${isOver ? 'scale-125' : 'text-[var(--ink-30)]'}`} />
                  <span className={`text-[0.625rem] tracking-[0.14em] uppercase ${isOver ? '' : 'text-[var(--ink-30)]'}`}>
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
