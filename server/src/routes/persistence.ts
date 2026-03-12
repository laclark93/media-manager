import { Router } from 'express';
import { readIgnored, writeIgnoredMismatches, writeIgnoredSubtitles, readLog, writeLog, SerializedLogEntry, readHistory, appendHistory } from '../persistence.js';
import * as log from '../logger.js';

const router = Router();

// --- Ignored items ---

router.get('/ignored', (_req, res) => {
  res.json(readIgnored());
});

router.put('/ignored/mismatches', (req, res) => {
  const keys: string[] = req.body;
  if (!Array.isArray(keys)) {
    res.status(400).json({ error: 'Expected array' });
    return;
  }
  const before = new Set(readIgnored().mismatches);
  const after = new Set(keys);
  const added = [...after].filter(k => !before.has(k));
  const removed = [...before].filter(k => !after.has(k));
  if (added.length) log.info(`Ignored anime mismatch: ${added.join(', ')}`);
  if (removed.length) log.info(`Restored anime mismatch: ${removed.join(', ')}`);
  writeIgnoredMismatches(keys);
  res.json({ success: true });
});

router.put('/ignored/subtitles', (req, res) => {
  const keys: string[] = req.body;
  if (!Array.isArray(keys)) {
    res.status(400).json({ error: 'Expected array' });
    return;
  }
  const before = new Set(readIgnored().subtitles);
  const after = new Set(keys);
  const added = [...after].filter(k => !before.has(k));
  const removed = [...before].filter(k => !after.has(k));
  if (added.length) log.info(`Ignored subtitle item: ${added.join(', ')}`);
  if (removed.length) log.info(`Restored subtitle item: ${removed.join(', ')}`);
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

// --- History snapshots ---

router.get('/history', (_req, res) => {
  res.json(readHistory());
});

router.post('/history', (req, res) => {
  const { shows, movies } = req.body;
  if (typeof shows !== 'number' || typeof movies !== 'number') {
    res.status(400).json({ error: 'Expected { shows: number, movies: number }' });
    return;
  }
  const history = appendHistory(shows, movies);
  res.json(history);
});

export default router;
