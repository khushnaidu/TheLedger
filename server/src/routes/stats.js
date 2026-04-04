const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const [total, byStatus, byPriority, byCategory, recentTickets] = await Promise.all([
      prisma.ticket.count({ where: { userId } }),
      prisma.ticket.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.ticket.groupBy({ by: ['priority'], where: { userId }, _count: true }),
      prisma.ticket.groupBy({ by: ['categoryId'], where: { userId }, _count: true }),
      prisma.ticket.findMany({
        where: { userId },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { category: true, labels: true },
      }),
    ]);

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
      recentTickets,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
