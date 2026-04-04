const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [total, byStatus, byPriority, byCategory, recentTickets] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.groupBy({ by: ['status'], _count: true }),
      prisma.ticket.groupBy({ by: ['priority'], _count: true }),
      prisma.ticket.groupBy({ by: ['categoryId'], _count: true }),
      prisma.ticket.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { category: true, labels: true },
      }),
    ]);

    const categories = await prisma.category.findMany();
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

    res.json({
      total,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map(p => [p.priority, p._count])),
      byCategory: byCategory.map(c => ({
        category: categoryMap[c.categoryId],
        count: c._count,
      })),
      recentTickets,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
