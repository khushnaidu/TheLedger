const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const labels = await prisma.label.findMany({
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
    const label = await prisma.label.create({ data: { name, color } });
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
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
    await prisma.label.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
