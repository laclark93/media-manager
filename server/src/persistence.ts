import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const IGNORED_FILE = path.join(DATA_DIR, 'ignored.json');
const LOG_FILE = path.join(DATA_DIR, 'activity-log.json');

export interface SerializedLogEntry {
  id: number;
  timestamp: string;
  action: string;
  target: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
}

interface IgnoredData {
  mismatches: string[];
  subtitles: string[];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readIgnored(): IgnoredData {
  try {
    if (fs.existsSync(IGNORED_FILE)) {
      return JSON.parse(fs.readFileSync(IGNORED_FILE, 'utf-8'));
    }
  } catch {
    // Corrupt file, return empty
  }
  return { mismatches: [], subtitles: [] };
}

export function writeIgnoredMismatches(keys: string[]): void {
  ensureDataDir();
  const current = readIgnored();
  fs.writeFileSync(IGNORED_FILE, JSON.stringify({ ...current, mismatches: keys }, null, 2));
}

export function writeIgnoredSubtitles(keys: string[]): void {
  ensureDataDir();
  const current = readIgnored();
  fs.writeFileSync(IGNORED_FILE, JSON.stringify({ ...current, subtitles: keys }, null, 2));
}

export function readLog(): SerializedLogEntry[] {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    }
  } catch {
    // Corrupt file, return empty
  }
  return [];
}

export function writeLog(entries: SerializedLogEntry[]): void {
  ensureDataDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries.slice(0, 100), null, 2));
}
