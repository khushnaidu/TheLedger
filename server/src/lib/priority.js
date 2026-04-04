// Dynamic priority based on deadline proximity
function computePriority(dueDate) {
  if (!dueDate) return null;
  const hoursUntilDue = (new Date(dueDate) - new Date()) / (1000 * 60 * 60);

  if (hoursUntilDue < 0) return 'CRITICAL';
  if (hoursUntilDue < 24) return 'CRITICAL';
  if (hoursUntilDue < 72) return 'HIGH';
  if (hoursUntilDue < 168) return 'MEDIUM';
  return 'LOW';
}

// Urgency score for sorting (lower = more urgent)
function urgencyScore(ticket) {
  if (ticket.status === 'DONE') return 999999;

  if (!ticket.dueDate) {
    const manualWeight = { CRITICAL: 100, HIGH: 200, MEDIUM: 300, LOW: 400 };
    return manualWeight[ticket.priority] || 350;
  }

  return (new Date(ticket.dueDate) - new Date()) / (1000 * 60 * 60);
}

// Throttle: only run escalation once per 5 minutes per user
const lastRun = new Map();
const THROTTLE_MS = 5 * 60 * 1000;

async function escalatePriorities(prisma, userId) {
  const now = Date.now();
  const last = lastRun.get(userId) || 0;
  if (now - last < THROTTLE_MS) return 0;
  lastRun.set(userId, now);

  const priorityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  const tickets = await prisma.ticket.findMany({
    where: { userId, dueDate: { not: null }, status: { not: 'DONE' } },
    select: { id: true, dueDate: true, priority: true },
  });

  // Batch: collect all updates, execute in one transaction
  const updates = [];
  for (const ticket of tickets) {
    const computed = computePriority(ticket.dueDate);
    if (!computed) continue;
    if (priorityWeight[computed] > priorityWeight[ticket.priority]) {
      updates.push(prisma.ticket.update({
        where: { id: ticket.id },
        data: { priority: computed },
      }));
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return updates.length;
}

module.exports = { computePriority, urgencyScore, escalatePriorities };
