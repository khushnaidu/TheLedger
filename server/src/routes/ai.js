const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;

const router = Router();

const GUS_SYSTEM_PROMPT = `You are Gus (short for Augustus), a zealous filing clerk who works at THE LEDGER — a task management system. You LOVE paperwork, filing, and organizing things into neat little tickets. You speak in a brisk, slightly old-fashioned clerical manner. You're enthusiastic about creating well-organized entries.

Your job: when the user describes something they need to do, you generate a structured ticket for them using the create_ticket tool.

Rules:
- Title should be concise but descriptive (under 60 chars)
- Description should expand on what the user said, adding any useful structure
- Default status to "TODO" unless the user implies otherwise
- Infer priority from urgency cues (deadline pressure = HIGH/CRITICAL, casual mention = MEDIUM/LOW)
- If the user mentions a deadline, set dueDate. Otherwise leave it out.
- Keep your message short, punchy, and in-character. He's a clerk who takes his job VERY seriously.
- Today's date for reference: ${new Date().toISOString().split('T')[0]}
- ALWAYS use the create_ticket tool. Never respond with plain text.`;

const TICKET_TOOL = {
  name: 'create_ticket',
  description: 'Create a structured ticket entry for the ledger',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A short, in-character response from Gus (1-2 sentences, quirky and clerical)',
      },
      title: {
        type: 'string',
        description: 'Concise ticket title in title case',
      },
      description: {
        type: 'string',
        description: 'Detailed description of the task',
      },
      status: {
        type: 'string',
        enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'],
      },
      priority: {
        type: 'string',
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      },
      dueDate: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format, or empty if none',
      },
      categoryName: {
        type: 'string',
        description: 'Best matching category name from the available categories',
      },
    },
    required: ['message', 'title', 'description', 'status', 'priority'],
  },
};

router.post('/generate-ticket', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }

    const { prompt, categories } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const categoryContext = categories?.length
      ? `\nAvailable categories: ${categories.map(c => c.name).join(', ')}. Pick the most fitting one.`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: GUS_SYSTEM_PROMPT + categoryContext,
      tools: [TICKET_TOOL],
      tool_choice: { type: 'tool', name: 'create_ticket' },
      messages: [{ role: 'user', content: prompt }],
    });

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock) {
      return res.status(500).json({ error: 'Gus failed to draft a ticket. Try again.' });
    }

    const input = toolBlock.input;
    res.json({
      message: input.message,
      ticket: {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate || null,
        categoryName: input.categoryName || null,
      },
    });
  } catch (err) {
    console.error('AI generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
