import { Router } from 'express';
import { readIgnored, writeIgnoredMismatches, writeIgnoredSubtitles, readLog, writeLog, SerializedLogEntry } from '../persistence.js';

const router = Router();

// --- Ignored items ---

router.get('/ignored', (_req, res) => {
  res.json(readIgnored());
});

router.put('/ignored/mismatches', (req, res) => {
  const keys = req.body;
  if (!Array.isArray(keys)) {
    res.status(400).json({ error: 'Expected array' });
    return;
  }
  writeIgnoredMismatches(keys);
  res.json({ success: true });
});

router.put('/ignored/subtitles', (req, res) => {
  const keys = req.body;
  if (!Array.isArray(keys)) {
    res.status(400).json({ error: 'Expected array' });
    return;
  }
  writeIgnoredSubtitles(keys);
  res.json({ success: true });
});

// --- Activity log ---

router.get('/log', (_req, res) => {
  res.json(readLog());
});

router.put('/log', (req, res) => {
  const entries = req.body as SerializedLogEntry[];
  if (!Array.isArray(entries)) {
    res.status(400).json({ error: 'Expected array' });
    return;
  }
  writeLog(entries);
  res.json({ success: true });
});

export default router;
