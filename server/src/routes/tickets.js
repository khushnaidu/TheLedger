const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// GET /api/tickets
router.get('/', async (req, res) => {
  try {
    const { status, priority, categoryId, labelId, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const where = { userId: req.user.id };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (categoryId) where.categoryId = categoryId;
    if (labelId) where.labels = { some: { id: labelId } };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: { category: true, labels: true },
      orderBy: { [sortBy]: sortOrder },
    });

    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { category: true, labels: true },
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets
router.post('/', async (req, res) => {
  try {
    const { title, description, status, priority, categoryId, labelIds, dueDate } = req.body;

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        status,
        priority,
        categoryId,
        userId: req.user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        labels: labelIds?.length ? { connect: labelIds.map(id => ({ id })) } : undefined,
      },
      include: { category: true, labels: true },
    });

    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id
router.patch('/:id', async (req, res) => {
  try {
    // Verify ownership
    const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const { title, description, status, priority, categoryId, labelIds, dueDate, order } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (order !== undefined) data.order = order;
    if (labelIds !== undefined) {
      data.labels = { set: labelIds.map(id => ({ id })) };
    }

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data,
      include: { category: true, labels: true },
    });

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tickets/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    await prisma.ticket.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id/move
router.patch('/:id/move', async (req, res) => {
  try {
    const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const { status, order } = req.body;
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status, order },
      include: { category: true, labels: true },
    });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
