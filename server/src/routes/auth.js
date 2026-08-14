const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signToken, authMiddleware } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), name, password: hashed },
    });

    // Seed default categories and labels for new user
    await prisma.category.createMany({
      data: [
        { name: 'Work', color: '#000000', icon: 'briefcase', userId: user.id },
        { name: 'School', color: '#000000', icon: 'graduation-cap', userId: user.id },
        { name: 'Adulting Chores', color: '#000000', icon: 'home', userId: user.id },
        { name: 'Personal', color: '#000000', icon: 'user', userId: user.id },
      ],
    });
    await prisma.label.createMany({
      data: [
        { name: 'urgent', color: '#c41e1e', userId: user.id },
        { name: 'bug', color: '#000000', userId: user.id },
        { name: 'feature', color: '#000000', userId: user.id },
        { name: 'research', color: '#000000', userId: user.id },
      ],
    });

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot — request a password reset link
router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always respond the same whether or not the account exists
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const base = process.env.APP_URL || req.get('origin') || 'http://localhost:5173';
      const resetUrl = `${base}/reset?token=${token}&email=${encodeURIComponent(user.email)}`;
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset — set a new password with a valid token
router.post('/reset', async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ error: 'Email, token, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const valid =
      user &&
      user.resetTokenHash === tokenHash &&
      user.resetTokenExpiresAt &&
      user.resetTokenExpiresAt > new Date();
    if (!valid) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetTokenHash: null, resetTokenExpiresAt: null },
    });

    // Sign them straight in with the new password
    const jwt = signToken(updated);
    res.json({ token: jwt, user: { id: updated.id, email: updated.email, name: updated.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
