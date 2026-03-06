import { Router } from 'express';
import { readIgnored, writeIgnoredMismatches, writeIgnoredSubtitles, readLog, writeLog, SerializedLogEntry } from '../persistence.js';

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
  if (added.length) console.log(`[INFO] Ignored anime mismatch: ${added.join(', ')}`);
  if (removed.length) console.log(`[INFO] Restored anime mismatch: ${removed.join(', ')}`);
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
  if (added.length) console.log(`[INFO] Ignored subtitle item: ${added.join(', ')}`);
  if (removed.length) console.log(`[INFO] Restored subtitle item: ${removed.join(', ')}`);
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
