// Dynamic priority based on deadline proximity
// Returns the priority a ticket SHOULD have based on its due date
function computePriority(dueDate) {
  if (!dueDate) return null; // no due date = keep manual priority
  const now = new Date();
  const due = new Date(dueDate);
  const hoursUntilDue = (due - now) / (1000 * 60 * 60);

  if (hoursUntilDue < 0) return 'CRITICAL';       // overdue
  if (hoursUntilDue < 24) return 'CRITICAL';       // less than 1 day
  if (hoursUntilDue < 72) return 'HIGH';           // less than 3 days
  if (hoursUntilDue < 168) return 'MEDIUM';        // less than 7 days
  return 'LOW';                                     // more than 7 days
}

// Urgency score for sorting (lower = more urgent)
// Tickets without due dates get a high score (least urgent)
function urgencyScore(ticket) {
  if (ticket.status === 'DONE') return 999999; // done tickets last

  if (!ticket.dueDate) {
    // No due date: sort by manual priority
    const manualWeight = { CRITICAL: 100, HIGH: 200, MEDIUM: 300, LOW: 400 };
    return manualWeight[ticket.priority] || 350;
  }

  const now = new Date();
  const due = new Date(ticket.dueDate);
  const hoursLeft = (due - now) / (1000 * 60 * 60);

  // Overdue tickets get negative scores (most urgent)
  // Otherwise hours until due = urgency score
  return hoursLeft;
}

// Recalculate priority for tickets that have due dates
// Only escalates — never downgrades a manually set high priority
async function escalatePriorities(prisma, userId) {
  const tickets = await prisma.ticket.findMany({
    where: {
      userId,
      dueDate: { not: null },
      status: { not: 'DONE' },
    },
  });

  const priorityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  let updated = 0;

  for (const ticket of tickets) {
    const computed = computePriority(ticket.dueDate);
    if (!computed) continue;

    // Only escalate, never downgrade
    if (priorityWeight[computed] > priorityWeight[ticket.priority]) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { priority: computed },
      });
      updated++;
    }
  }

  return updated;
}

module.exports = { computePriority, urgencyScore, escalatePriorities };
