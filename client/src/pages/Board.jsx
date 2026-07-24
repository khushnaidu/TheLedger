import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { STATUSES, STATUS_CONFIG } from '../constants';
import TicketCard from '../components/TicketCard';
import UndoToast from '../components/UndoToast';
import { awardXP } from '../lib/xp';
import { updateQuestProgress } from '../lib/quests';
import { ASSETS, STATUS_LABELS } from '../lib/theme';

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
  const [stampingId, setStampingId] = useState(null);
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
      window.dispatchEvent(new CustomEvent('gus-ticket-moved', {
        detail: { from: ticket?.status, to: 'TRASH', title: ticket?.title },
      }));
      return;
    }

    // Normal column move
    const ticket = tickets.find((t) => t.id === draggableId);
    const fromStatus = ticket?.status;
    setTickets((prev) => prev.map((t) => t.id === draggableId ? { ...t, status: destination.droppableId, order: destination.index } : t));
    try { await api.moveTicket(draggableId, { status: destination.droppableId, order: destination.index }); } catch { fetchTickets(); }

    // Stamp animation + award XP if moved to DONE
    if (destination.droppableId === 'DONE' && ticket) {
      setStampingId(draggableId);
      setTimeout(() => setStampingId(null), 1200);
      const result = awardXP(ticket.id, ticket.priority);
      if (result) {
        window.dispatchEvent(new CustomEvent('gus-xp-gained', { detail: result }));
      }
      const questState = updateQuestProgress('complete', ticket.priority);
      if (questState.completed) {
        window.dispatchEvent(new CustomEvent('gus-quest-complete', { detail: questState }));
      }
    }

    // Track moves for quest progress
    if (destination.droppableId !== fromStatus) {
      updateQuestProgress('move');
      if (fromStatus === 'BACKLOG' && destination.droppableId !== 'BACKLOG') {
        updateQuestProgress('clear_backlog');
      }
    }

    // Notify Gus about the move
    window.dispatchEvent(new CustomEvent('gus-ticket-moved', {
      detail: { from: fromStatus, to: destination.droppableId, title: ticket?.title },
    }));
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
    <div className="max-w-full pb-[110px]">
      <div className="flex items-baseline justify-between mb-6">
        <div className="flex items-baseline gap-6">
          <h1 className="t-display text-[2rem]">Board</h1>
          <p className="t-label">Workflow — drag to reclassify</p>
        </div>
        <p className="t-label">
          {String(tickets.length).padStart(4, '0')} entries in circulation
        </p>
      </div>

      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Columns — fixed height, internal scroll */}
        <div className="flex gap-4 overflow-x-auto" style={{ height: 'calc(100vh - 330px)', minHeight: '400px' }}>
          {STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            const colTickets = columns[status] || [];
            const isActive = status === 'IN_PROGRESS';

            return (
              <div key={status} className="flex-shrink-0 w-[240px] flex flex-col">
                <div className={`mb-2 ${isActive ? 'rule-4' : 'rule-2'}`} style={isActive ? { background: 'var(--stamp)' } : {}} />
                <div className="flex items-baseline justify-between mb-3 border-b border-[var(--ink-08)] pb-2">
                  <span className={`t-label ${isActive ? 'text-[var(--stamp)]' : ''}`}>{STATUS_LABELS[status] || config.label}</span>
                  <span className="t-small counter-num">{String(colTickets.length).padStart(2, '0')}</span>
                </div>

                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`space-y-2 flex-1 overflow-y-auto pr-1 ${snapshot.isDraggingOver ? 'bg-[var(--ink-04)] p-2 -m-2' : ''}`}>
                      {colTickets.map((ticket, index) => (
                        <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                          {(prov, snap) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                              className={`relative ${deletingId === ticket.id ? 'trash-crumple' : ''}`}>
                              <TicketCard ticket={ticket} isDragging={snap.isDragging} />
                              {stampingId === ticket.id && (
                                <div className="done-stamp-overlay">
                                  <span className="done-stamp">Done</span>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {colTickets.length === 0 && !snapshot.isDraggingOver && (
                        <div className="pt-6 text-center">
                          <img src={ASSETS.emptyColumn} alt="" className="w-[120px] mx-auto mb-2" />
                          <span className="t-small">Empty — peace and nothing else</span>
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
        <div className={`relative z-50 bg-white transition-all duration-200 overflow-hidden ${
          dragging ? 'max-h-[100px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}>
          <Droppable droppableId="TRASH">
            {(provided, snapshot) => {
              const isOver = snapshot.isDraggingOver;
              return (
                <div ref={provided.innerRef} {...provided.droppableProps}
                  className={`relative overflow-hidden flex items-center justify-center gap-3 py-6 border-2 border-dashed transition-all duration-150 ${
                    isOver
                      ? 'border-[var(--stamp)] bg-black text-white'
                      : 'border-[var(--ink-15)]'
                  }`}>
                  {/* the fire pit — two rows of flames, back row dimmer and offset */}
                  <div
                    className={`absolute inset-x-0 bottom-0 pointer-events-none transition-all duration-150 ${isOver ? 'h-[64px] opacity-70' : 'h-[40px] opacity-40'}`}
                    style={{ backgroundImage: "url('/art/fire.gif')", backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%', backgroundPosition: '60px bottom' }}
                  />
                  <div
                    className={`absolute inset-x-0 bottom-0 pointer-events-none transition-all duration-150 ${isOver ? 'h-[52px] opacity-100' : 'h-[30px] opacity-70'}`}
                    style={{ backgroundImage: "url('/art/fire.gif')", backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%', backgroundPosition: 'bottom' }}
                  />
                  <Trash2 className={`relative z-10 w-4 h-4 transition-transform duration-150 ${isOver ? 'scale-125' : 'text-[var(--ink-30)]'}`} />
                  <span className={`relative z-10 text-[0.625rem] tracking-[0.14em] uppercase ${isOver ? '' : 'text-[var(--ink-30)]'}`}>
                    {isOver ? 'Into the fire pit' : 'Drag here to delete'}
                  </span>
                  <div className="hidden">{provided.placeholder}</div>
                </div>
              );
            }}
          </Droppable>
        </div>
      </DragDropContext>

      {/* The sky, and Sev on patrol beneath it */}
      <img src="/art/actuallyican.png" alt="" className="board-sky" />
      <img src="/art/sev.gif" alt="" className="sev-walk" />

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
