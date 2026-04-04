const { Router } = require('express');
const prisma = require('../lib/prisma');
const { computePriority } = require('../lib/priority');

const router = Router();

// Helper: make Canvas API request
async function canvasRequest(baseUrl, token, path) {
  const url = `${baseUrl}/api/v1${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canvas API error (${res.status}): ${text}`);
  }
  return res.json();
}

// Helper: fetch all pages from Canvas (handles pagination)
async function canvasRequestAll(baseUrl, token, path, params = {}) {
  const qs = new URLSearchParams(params);
  qs.set('per_page', '100');
  let url = `${baseUrl}/api/v1${path}?${qs}`;
  const all = [];

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canvas API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    all.push(...data);

    const link = res.headers.get('Link');
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return all;
}

// GET /api/canvas/status
router.get('/status', async (req, res) => {
  try {
    const config = await prisma.canvasIntegration.findUnique({
      where: { userId: req.user.id },
    });
    if (!config) return res.json({ connected: false });
    res.json({
      connected: true,
      baseUrl: config.baseUrl,
      userName: config.userName,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/canvas/connect
router.post('/connect', async (req, res) => {
  try {
    const { baseUrl, apiToken } = req.body;
    if (!baseUrl || !apiToken) {
      return res.status(400).json({ error: 'baseUrl and apiToken are required' });
    }

    const normalizedUrl = baseUrl.replace(/\/+$/, '');
    const canvasUser = await canvasRequest(normalizedUrl, apiToken, '/users/self');

    const config = await prisma.canvasIntegration.upsert({
      where: { userId: req.user.id },
      update: {
        baseUrl: normalizedUrl,
        apiToken,
        userName: canvasUser.name || canvasUser.short_name,
      },
      create: {
        baseUrl: normalizedUrl,
        apiToken,
        userId: req.user.id,
        userName: canvasUser.name || canvasUser.short_name,
      },
    });

    res.json({
      connected: true,
      baseUrl: config.baseUrl,
      userName: config.userName,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/canvas/disconnect
router.delete('/disconnect', async (req, res) => {
  try {
    await prisma.canvasIntegration.deleteMany({ where: { userId: req.user.id } });
    res.json({ connected: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/canvas/courses
router.get('/courses', async (req, res) => {
  try {
    const config = await prisma.canvasIntegration.findUnique({ where: { userId: req.user.id } });
    if (!config) return res.status(400).json({ error: 'Canvas not connected' });

    const courses = await canvasRequestAll(config.baseUrl, config.apiToken, '/courses', {
      enrollment_state: 'active',
      include: ['term', 'total_students'],
    });

    const active = courses
      .filter((c) => c.workflow_state === 'available')
      .map((c) => ({
        id: String(c.id),
        name: c.name,
        code: c.course_code,
        term: c.term?.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(active);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/canvas/courses/:courseId/assignments
router.get('/courses/:courseId/assignments', async (req, res) => {
  try {
    const config = await prisma.canvasIntegration.findUnique({ where: { userId: req.user.id } });
    if (!config) return res.status(400).json({ error: 'Canvas not connected' });

    const assignments = await canvasRequestAll(
      config.baseUrl,
      config.apiToken,
      `/courses/${req.params.courseId}/assignments`,
      { order_by: 'due_at', include: ['submission'] }
    );

    const canvasIds = assignments.map((a) => String(a.id));
    const imported = await prisma.ticket.findMany({
      where: { canvasAssignmentId: { in: canvasIds }, userId: req.user.id },
      select: { canvasAssignmentId: true, id: true },
    });
    const importedMap = Object.fromEntries(imported.map((t) => [t.canvasAssignmentId, t.id]));

    const result = assignments.map((a) => ({
      id: String(a.id),
      name: a.name,
      description: a.description ? stripHtml(a.description) : null,
      dueAt: a.due_at,
      pointsPossible: a.points_possible,
      htmlUrl: a.html_url,
      submissionTypes: a.submission_types,
      submitted: a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded',
      graded: a.submission?.workflow_state === 'graded',
      score: a.submission?.score,
      imported: !!importedMap[String(a.id)],
      ticketId: importedMap[String(a.id)] || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/canvas/import
router.post('/import', async (req, res) => {
  try {
    const { assignments, categoryId } = req.body;
    if (!assignments?.length) return res.status(400).json({ error: 'No assignments provided' });
    if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });

    const created = [];
    const skipped = [];

    for (const a of assignments) {
      const existing = await prisma.ticket.findFirst({
        where: { canvasAssignmentId: String(a.id), userId: req.user.id },
      });
      if (existing) {
        skipped.push({ id: a.id, name: a.name, ticketId: existing.id });
        continue;
      }

      let priority = 'MEDIUM';
      if (a.dueAt) {
        const daysUntilDue = (new Date(a.dueAt) - new Date()) / (1000 * 60 * 60 * 24);
        if (daysUntilDue < 0) priority = 'CRITICAL';
        else if (daysUntilDue < 2) priority = 'HIGH';
        else if (daysUntilDue < 7) priority = 'MEDIUM';
        else priority = 'LOW';
      }

      let status = 'TODO';
      if (a.submitted || a.graded) status = 'DONE';

      const description = [
        a.description || '',
        '',
        `Canvas: ${a.htmlUrl || ''}`,
        a.pointsPossible ? `Points: ${a.pointsPossible}` : '',
        a.submissionTypes?.length ? `Type: ${a.submissionTypes.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      const ticket = await prisma.ticket.create({
        data: {
          title: a.name,
          description,
          status,
          priority,
          categoryId,
          userId: req.user.id,
          dueDate: a.dueAt ? new Date(a.dueAt) : null,
          canvasAssignmentId: String(a.id),
          canvasCourseId: String(a.courseId),
        },
        include: { category: true, labels: true },
      });

      created.push(ticket);
    }

    res.json({ created, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/canvas/sync
router.post('/sync', async (req, res) => {
  try {
    const config = await prisma.canvasIntegration.findUnique({ where: { userId: req.user.id } });
    if (!config) return res.status(400).json({ error: 'Canvas not connected' });

    const canvasTickets = await prisma.ticket.findMany({
      where: { canvasAssignmentId: { not: null }, userId: req.user.id },
    });

    if (canvasTickets.length === 0) return res.json({ updated: 0 });

    const byCourse = {};
    for (const t of canvasTickets) {
      if (!t.canvasCourseId) continue;
      if (!byCourse[t.canvasCourseId]) byCourse[t.canvasCourseId] = [];
      byCourse[t.canvasCourseId].push(t);
    }

    let updated = 0;
    for (const [courseId, tickets] of Object.entries(byCourse)) {
      const assignments = await canvasRequestAll(
        config.baseUrl,
        config.apiToken,
        `/courses/${courseId}/assignments`,
        { include: ['submission'] }
      );
      const assignmentMap = Object.fromEntries(assignments.map((a) => [String(a.id), a]));

      for (const ticket of tickets) {
        const a = assignmentMap[ticket.canvasAssignmentId];
        if (!a) continue;

        const data = {};
        if (a.due_at && (!ticket.dueDate || new Date(a.due_at).getTime() !== ticket.dueDate.getTime())) {
          data.dueDate = new Date(a.due_at);
        }
        if (a.name !== ticket.title) {
          data.title = a.name;
        }
        const isCompleted = a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded';
        if (isCompleted && ticket.status !== 'DONE') {
          data.status = 'DONE';
        }

        if (Object.keys(data).length > 0) {
          await prisma.ticket.update({ where: { id: ticket.id }, data });
          updated++;
        }
      }
    }

    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/canvas/auto-sync — silently import new assignments + update existing
// Called on dashboard load. Imports from ALL active courses into School category.
router.post('/auto-sync', async (req, res) => {
  try {
    const config = await prisma.canvasIntegration.findUnique({ where: { userId: req.user.id } });
    if (!config) return res.json({ imported: 0, updated: 0 });

    // Find or create School category for this user
    let schoolCategory = await prisma.category.findFirst({
      where: { userId: req.user.id, name: { equals: 'School', mode: 'insensitive' } },
    });
    if (!schoolCategory) {
      schoolCategory = await prisma.category.create({
        data: { name: 'School', color: '#000000', icon: 'graduation-cap', userId: req.user.id },
      });
    }

    // Fetch all active courses
    let courses;
    try {
      courses = await canvasRequestAll(config.baseUrl, config.apiToken, '/courses', {
        enrollment_state: 'active',
      });
      courses = courses.filter((c) => c.workflow_state === 'available');
    } catch {
      return res.json({ imported: 0, updated: 0, error: 'Could not reach Canvas' });
    }

    let imported = 0;
    let updated = 0;

    for (const course of courses) {
      let assignments;
      try {
        assignments = await canvasRequestAll(
          config.baseUrl,
          config.apiToken,
          `/courses/${course.id}/assignments`,
          { include: ['submission'] }
        );
      } catch {
        continue; // skip courses we can't read
      }

      for (const a of assignments) {
        const canvasId = String(a.id);
        const courseId = String(course.id);

        const existing = await prisma.ticket.findFirst({
          where: { canvasAssignmentId: canvasId, userId: req.user.id },
        });

        const isSubmitted = a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded';

        if (existing) {
          // Update existing ticket
          const data = {};
          if (a.due_at && (!existing.dueDate || new Date(a.due_at).getTime() !== existing.dueDate.getTime())) {
            data.dueDate = new Date(a.due_at);
          }
          if (a.name !== existing.title) {
            data.title = a.name;
          }
          if (isSubmitted && existing.status !== 'DONE') {
            data.status = 'DONE';
          }
          if (Object.keys(data).length > 0) {
            await prisma.ticket.update({ where: { id: existing.id }, data });
            updated++;
          }
        } else {
          // Import new assignment
          const priority = computePriority(a.due_at) || 'MEDIUM';
          const status = isSubmitted ? 'DONE' : 'TODO';

          const description = [
            a.description ? stripHtml(a.description) : '',
            '',
            a.html_url ? `Canvas: ${a.html_url}` : '',
            a.points_possible ? `Points: ${a.points_possible}` : '',
            a.submission_types?.length ? `Type: ${a.submission_types.join(', ')}` : '',
          ].filter(Boolean).join('\n');

          await prisma.ticket.create({
            data: {
              title: a.name,
              description,
              status,
              priority,
              categoryId: schoolCategory.id,
              userId: req.user.id,
              dueDate: a.due_at ? new Date(a.due_at) : null,
              canvasAssignmentId: canvasId,
              canvasCourseId: courseId,
            },
          });
          imported++;
        }
      }
    }

    res.json({ imported, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = router;
