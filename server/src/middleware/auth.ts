import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { readSettings } from '../settings.js';
import * as log from '../logger.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const settings = readSettings();

  // If no credentials configured, allow all requests through
  if (!settings.username || !settings.passwordHash || !settings.jwtSecret) {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    log.warn(`Auth: ${req.method} ${req.path} — rejected: no token provided`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    jwt.verify(token, settings.jwtSecret);
    next();
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    log.warn(`Auth: ${req.method} ${req.path} — rejected: invalid token (${reason})`);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
