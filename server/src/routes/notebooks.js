const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

const COVERS = ['composition', 'cloth', 'leather', 'kraft'];
const PAPERS = ['ruled', 'grid', 'dot', 'plain'];
const EMPTY_PAGE = { v: 1, items: [] };
// a page heavier than this is ink-hoarding — the client blocks at 300KB first
const MAX_PAGE_BYTES = 400_000;

const ownNotebook = (id, userId) =>
  prisma.notebook.findFirst({ where: { id, userId } });

// GET /api/notebooks — the shelf
router.get('/', async (req, res) => {
  try {
    const notebooks = await prisma.notebook.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { pages: true } } },
    });
    res.json(notebooks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notebooks — new notebook, opens on page 1
router.post('/', async (req, res) => {
  try {
    const { title, coverStyle, paperStyle } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'A notebook needs a title' });
    const notebook = await prisma.notebook.create({
      data: {
        title: title.trim().slice(0, 60),
        coverStyle: COVERS.includes(coverStyle) ? coverStyle : 'composition',
        paperStyle: PAPERS.includes(paperStyle) ? paperStyle : 'ruled',
        userId: req.user.id,
        pages: { create: { pageNumber: 1, content: EMPTY_PAGE } },
      },
      include: { pages: true },
    });
    res.status(201).json(notebook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notebooks/:id — notebook with all pages in order
router.get('/:id', async (req, res) => {
  try {
    const notebook = await prisma.notebook.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { pages: { orderBy: { pageNumber: 'asc' } } },
    });
    if (!notebook) return res.status(404).json({ error: 'Notebook not found' });
    res.json(notebook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notebooks/:id — title / cover / paper
router.patch('/:id', async (req, res) => {
  try {
    const existing = await ownNotebook(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Notebook not found' });
    const { title, coverStyle, paperStyle } = req.body;
    const data = {};
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'A notebook needs a title' });
      data.title = title.trim().slice(0, 60);
    }
    if (coverStyle !== undefined && COVERS.includes(coverStyle)) data.coverStyle = coverStyle;
    if (paperStyle !== undefined && PAPERS.includes(paperStyle)) data.paperStyle = paperStyle;
    const notebook = await prisma.notebook.update({ where: { id: existing.id }, data });
    res.json(notebook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notebooks/:id — pages cascade
router.delete('/:id', async (req, res) => {
  try {
    const existing = await ownNotebook(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Notebook not found' });
    await prisma.notebook.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notebooks/:id/pages — append the next page
router.post('/:id/pages', async (req, res) => {
  try {
    const existing = await ownNotebook(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Notebook not found' });
    const last = await prisma.notebookPage.findFirst({
      where: { notebookId: existing.id },
      orderBy: { pageNumber: 'desc' },
    });
    const page = await prisma.notebookPage.create({
      data: { notebookId: existing.id, pageNumber: (last?.pageNumber || 0) + 1, content: EMPTY_PAGE },
    });
    res.status(201).json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notebooks/:id/pages/:pageId — the autosave target
router.patch('/:id/pages/:pageId', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !Array.isArray(content.items)) {
      return res.status(400).json({ error: 'content must be { v, items: [] }' });
    }
    if (JSON.stringify(content).length > MAX_PAGE_BYTES) {
      return res.status(413).json({ error: 'This page is over capacity — start a fresh one' });
    }
    const page = await prisma.notebookPage.findFirst({
      where: { id: req.params.pageId, notebook: { id: req.params.id, userId: req.user.id } },
    });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    const updated = await prisma.notebookPage.update({
      where: { id: page.id },
      data: { content },
    });
    // bump the notebook so the shelf sorts by real activity
    await prisma.notebook.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notebooks/:id/pages/:pageId — remove + close the numbering gap
router.delete('/:id/pages/:pageId', async (req, res) => {
  try {
    const page = await prisma.notebookPage.findFirst({
      where: { id: req.params.pageId, notebook: { id: req.params.id, userId: req.user.id } },
    });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    const count = await prisma.notebookPage.count({ where: { notebookId: page.notebookId } });
    if (count <= 1) return res.status(400).json({ error: 'A notebook keeps at least one page' });
    // renumber one-by-one ascending — a bulk decrement can transiently
    // collide with the unique (notebookId, pageNumber) constraint
    await prisma.$transaction(async (tx) => {
      await tx.notebookPage.delete({ where: { id: page.id } });
      const laterPages = await tx.notebookPage.findMany({
        where: { notebookId: page.notebookId, pageNumber: { gt: page.pageNumber } },
        orderBy: { pageNumber: 'asc' },
      });
      for (const p of laterPages) {
        await tx.notebookPage.update({ where: { id: p.id }, data: { pageNumber: p.pageNumber - 1 } });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
