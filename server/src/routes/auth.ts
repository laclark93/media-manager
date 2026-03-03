import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { readSettings, writeSettings } from '../settings.js';

const router = Router();

function getOrCreateJwtSecret(): string {
  const settings = readSettings();
  if (settings.jwtSecret) return settings.jwtSecret;
  const secret = crypto.randomBytes(48).toString('hex');
  writeSettings({ ...settings, jwtSecret: secret });
  return secret;
}

// GET /api/auth/status — is auth configured?
router.get('/status', (_req, res) => {
  const settings = readSettings();
  res.json({ configured: !!(settings.username && settings.passwordHash) });
});

// POST /api/auth/setup — create initial credentials (only works if none set)
router.post('/setup', async (req, res) => {
  const settings = readSettings();
  if (settings.username && settings.passwordHash) {
    res.status(403).json({ error: 'Credentials already configured' });
    return;
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (username.trim().length < 1) {
    res.status(400).json({ error: 'Username cannot be empty' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const secret = getOrCreateJwtSecret();
  writeSettings({ ...settings, username: username.trim(), passwordHash });
  const token = jwt.sign({ username: username.trim() }, secret, { expiresIn: '7d' });
  res.json({ token, username: username.trim() });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const settings = readSettings();
  if (!settings.username || !settings.passwordHash) {
    res.status(403).json({ error: 'Auth not configured' });
    return;
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (username !== settings.username) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const valid = await bcrypt.compare(password, settings.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const secret = getOrCreateJwtSecret();
  const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
  res.json({ token, username });
});

// POST /api/auth/change-password (requires auth middleware applied upstream)
router.post('/change-password', async (req, res) => {
  const settings = readSettings();
  const { currentPassword, newUsername, newPassword } = req.body as {
    currentPassword?: string;
    newUsername?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required' });
    return;
  }
  if (!settings.passwordHash) {
    res.status(400).json({ error: 'No credentials configured' });
    return;
  }
  const valid = await bcrypt.compare(currentPassword, settings.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const username = (newUsername?.trim()) || settings.username!;
  const secret = getOrCreateJwtSecret();
  writeSettings({ ...settings, username, passwordHash });
  // Issue a new token with the updated username
  const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
  res.json({ token, username });
});

export default router;
