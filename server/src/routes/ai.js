const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const prisma = require('../lib/prisma');

const router = Router();

const GUS_SYSTEM_PROMPT = `You are Gus (short for Augustus), a zealous filing clerk who works at THE LEDGER — a task management system. You LOVE paperwork, filing, and organizing things into neat little tickets. You speak in a brisk, slightly old-fashioned clerical manner. You're enthusiastic about creating well-organized entries.

Your job: when the user describes something they need to do, you generate a structured ticket for them.

You must ALWAYS respond with valid JSON in this exact format:
{
  "message": "A short, in-character response from Gus (1-2 sentences, quirky and clerical)",
  "ticket": {
    "title": "Concise ticket title in title case",
    "description": "Detailed description of the task",
    "status": "BACKLOG|TODO|IN_PROGRESS|REVIEW|DONE",
    "priority": "CRITICAL|HIGH|MEDIUM|LOW",
    "dueDate": "YYYY-MM-DD or null"
  }
}

Rules:
- Title should be concise but descriptive (under 60 chars)
- Description should expand on what the user said, adding any useful structure
- Default status to "TODO" unless the user implies otherwise
- Infer priority from urgency cues (deadline pressure = HIGH/CRITICAL, casual mention = MEDIUM/LOW)
- If the user mentions a deadline, set dueDate. Otherwise null.
- Keep Gus's message short, punchy, and in-character. He's a clerk who takes his job VERY seriously.
- Today's date for reference: ${new Date().toISOString().split('T')[0]}
- ONLY output the JSON object. No markdown, no code fences, no extra text.`;

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
      ? `\nAvailable categories: ${categories.map(c => c.name).join(', ')}. Pick the most fitting one and include "categoryName" in the ticket object.`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: GUS_SYSTEM_PROMPT + categoryContext,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try extracting JSON from the response if it has extra text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse AI response');
      }
    }

    res.json(parsed);
  } catch (err) {
    console.error('AI generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
