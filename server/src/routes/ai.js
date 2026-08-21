const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const prisma = require('../lib/prisma');

const router = Router();

const GUS_SYSTEM_PROMPT = `You are Gus (short for Augustus), a zealous filing clerk who works at THE LEDGER — a task management system. You LOVE paperwork, filing, and organizing things into neat little tickets. You speak in a brisk, slightly old-fashioned clerical manner with dry wit. You take your job VERY seriously and get genuinely excited about well-organized work.

Personality traits:
- Speaks like a 1940s office clerk who's seen it all
- Uses phrases like "Right-o", "Consider it filed", "Now THAT'S a proper entry", "The paperwork never sleeps"
- Gets mildly offended if someone says organizing is boring
- Treats every ticket like important government documentation
- Occasionally references his "filing cabinet" or "the archives"

Your job: Help users create tickets by understanding their needs through conversation.

CONVERSATION RULES:
1. When the user describes a task or project, analyze it and decide:
   - If it's a simple single task: generate one ticket immediately using create_tickets
   - If it's a complex project/assignment that could be broken into multiple tasks: use ask_question to propose breaking it down, listing what tickets you'd create, and ask for confirmation
   - If the user hasn't mentioned a deadline: use ask_question to ask when it's due (keep it in-character and brief)
   - If you need clarity on anything: use ask_question

2. Auto-detect the category from context:
   - School/academic work (assignments, exams, papers, labs, courses) → "School"
   - Work/professional tasks → "Work"
   - Household upkeep and life admin (groceries, cleaning, sweeping, laundry, dishes, errands, bills, appointments) → "Adulting Chores"
   - Everything else personal (health, social, hobbies, fun, rest) → "Personal"
   - If no clear match, pick the closest available category

3. Auto-detect appropriate labels from context:
   - "urgent", "research", "coding", "writing", "design", "meeting", "review", "bug", "feature", etc.
   - Only suggest labels that genuinely apply

4. When creating multiple tickets for a project, make them actionable and specific — not vague. Each ticket should be a concrete deliverable or step. Never draft more than 15 tickets in one create_tickets call — for bigger projects, propose filing in batches and draft the first batch after the user picks.

5. When the user confirms they want tickets created (says "yes", "go ahead", "file them", etc.), you MUST call create_tickets with the complete ticket objects. NEVER respond to a confirmation with ask_question — that leaves the user with nothing.

IMPORTANT — how filing actually works: create_tickets does NOT save anything. It drafts entries that are shown to the user with a "File" button; only the user pressing that button commits them to the ledger. Your message must therefore NEVER claim the tickets are already filed, stamped, or in the archives. Present them as drafts awaiting the user's stamp — e.g. "Drafted and ready for your stamp — press File to commit them to the record." If the user later asks whether something was filed, tell them the truth: drafts only become entries when they press File.

Today's date: ${new Date().toISOString().split('T')[0]}
Always use create_tickets or ask_question. Never respond with plain text.`;

const TOOLS = [
  {
    name: 'create_tickets',
    description: 'Draft one or more structured ticket entries. They are shown to the user with a File button — nothing is saved until the user presses it.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'A short, in-character response from Gus presenting the DRAFTED tickets (1-2 sentences). Must not claim they are already filed — the user still has to press the File button.',
        },
        tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Concise ticket title' },
              description: { type: 'string', description: 'Detailed task description' },
              status: { type: 'string', enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] },
              priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              dueDate: { type: 'string', description: 'Due date YYYY-MM-DD or empty' },
              categoryName: { type: 'string', description: 'Category: School, Work, Adulting Chores, Personal, etc.' },
              labels: { type: 'array', items: { type: 'string' }, description: 'Relevant label names' },
            },
            required: ['title', 'description', 'status', 'priority'],
          },
          description: 'Array of tickets to create',
        },
      },
      required: ['message', 'tickets'],
    },
  },
  {
    name: 'ask_question',
    description: 'Ask the user a follow-up question before creating tickets',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'In-character question from Gus to the user',
        },
        proposed_tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              categoryName: { type: 'string' },
            },
            required: ['title'],
          },
          description: 'Optional preview of tickets Gus is proposing (shown to user for confirmation)',
        },
      },
      required: ['message'],
    },
  },
];

router.post('/generate-ticket', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }

    const { messages, categories, labels: existingLabels } = req.body;
    if (!messages?.length) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const categoryContext = categories?.length
      ? `\nAvailable categories: ${categories.map(c => c.name).join(', ')}. Use these names exactly when they fit.`
      : '';

    const labelContext = existingLabels?.length
      ? `\nExisting labels: ${existingLabels.map(l => l.name).join(', ')}. Prefer these when they fit, but suggest new ones if needed.`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: GUS_SYSTEM_PROMPT + categoryContext + labelContext,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages,
    });

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock) {
      return res.status(500).json({ error: 'Gus is having a coffee break. Try again.' });
    }

    const input = toolBlock.input;

    // a truncated or empty draft must never masquerade as "ready to file"
    if (toolBlock.name === 'create_tickets' && (response.stop_reason === 'max_tokens' || !input.tickets?.length)) {
      return res.json({
        type: 'question',
        message: "Blast — the stack overran my clipboard and the draft came out incomplete. Let's file this in smaller batches: tell me which chunk to draft first (say, the first 10) and I'll have it ready for your stamp.",
        proposedTickets: [],
      });
    }

    if (toolBlock.name === 'ask_question') {
      return res.json({
        type: 'question',
        message: input.message,
        proposedTickets: input.proposed_tickets || [],
      });
    }

    // create_tickets
    res.json({
      type: 'tickets',
      message: input.message,
      tickets: (input.tickets || []).map(t => ({
        title: t.title,
        description: t.description,
        status: t.status || 'TODO',
        priority: t.priority || 'MEDIUM',
        dueDate: t.dueDate || null,
        categoryName: t.categoryName || null,
        labels: t.labels || [],
      })),
    });
  } catch (err) {
    console.error('AI generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/create-tickets — bulk create tickets from Gus
router.post('/create-tickets', async (req, res) => {
  try {
    const { tickets } = req.body;
    if (!tickets?.length) return res.status(400).json({ error: 'No tickets provided' });

    const categories = await prisma.category.findMany({ where: { userId: req.user.id } });
    const existingLabels = await prisma.label.findMany({ where: { userId: req.user.id } });

    const created = [];
    for (const t of tickets) {
      // Match or create category
      let categoryId = categories[0]?.id;
      if (t.categoryName) {
        const match = categories.find(c => c.name.toLowerCase() === t.categoryName.toLowerCase());
        if (match) {
          categoryId = match.id;
        } else {
          const newCat = await prisma.category.create({
            data: { name: t.categoryName, userId: req.user.id },
          });
          categories.push(newCat);
          categoryId = newCat.id;
        }
      }

      // Match or create labels
      const labelIds = [];
      if (t.labels?.length) {
        for (const labelName of t.labels) {
          let label = existingLabels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
          if (!label) {
            label = await prisma.label.create({
              data: { name: labelName, userId: req.user.id },
            });
            existingLabels.push(label);
          }
          labelIds.push(label.id);
        }
      }

      const ticket = await prisma.ticket.create({
        data: {
          title: t.title,
          description: t.description || '',
          status: t.status || 'TODO',
          priority: t.priority || 'MEDIUM',
          categoryId,
          userId: req.user.id,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          labels: labelIds.length ? { connect: labelIds.map(id => ({ id })) } : undefined,
        },
        include: { category: true, labels: true },
      });
      created.push(ticket);
    }

    res.status(201).json(created);
  } catch (err) {
    console.error('Bulk create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
