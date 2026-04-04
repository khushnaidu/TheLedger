const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const labels = await prisma.label.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    const label = await prisma.label.create({
      data: { name, color, userId: req.user.id },
    });
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.label.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Label not found' });

    const { name, color } = req.body;
    const label = await prisma.label.update({
      where: { id: req.params.id },
      data: { name, color },
    });
    res.json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.label.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Label not found' });

    await prisma.label.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
