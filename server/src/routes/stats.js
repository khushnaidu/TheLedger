const { Router } = require('express');
const prisma = require('../lib/prisma');
const { escalatePriorities, urgencyScore } = require('../lib/priority');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Escalate priorities before computing stats
    await escalatePriorities(prisma, userId);

    const [total, byStatus, byPriority, byCategory] = await Promise.all([
      prisma.ticket.count({ where: { userId } }),
      prisma.ticket.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.ticket.groupBy({ by: ['priority'], where: { userId }, _count: true }),
      prisma.ticket.groupBy({ by: ['categoryId'], where: { userId }, _count: true }),
    ]);

    // Get active tickets sorted by urgency (most urgent first)
    const activeTickets = await prisma.ticket.findMany({
      where: { userId, status: { not: 'DONE' } },
      include: { category: true, labels: true },
    });
    activeTickets.sort((a, b) => urgencyScore(a) - urgencyScore(b));
    const urgentTickets = activeTickets.slice(0, 5);

    const categories = await prisma.category.findMany({ where: { userId } });
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

    res.json({
      total,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map(p => [p.priority, p._count])),
      byCategory: byCategory.map(c => ({
        category: categoryMap[c.categoryId],
        count: c._count,
      })),
      urgentTickets,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
