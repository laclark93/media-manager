import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './config.js';
import sonarrRouter from './routes/sonarr.js';
import radarrRouter from './routes/radarr.js';
import settingsRouter from './routes/settings.js';
import jellyseerrRouter from './routes/jellyseerr.js';
import plexRouter from './routes/plex.js';
import authRouter from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Auth routes are public (no middleware)
app.use('/api/auth', authRouter);

// All other API routes require authentication (when configured)
app.use('/api', authMiddleware);

app.use('/api/sonarr', sonarrRouter);
app.use('/api/radarr', radarrRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/jellyseerr', jellyseerrRouter);
app.use('/api/plex', plexRouter);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

const config = getConfig();
app.listen(config.port, () => {
  console.log(`[INFO] Missing Media Dashboard running on port ${config.port}`);
  console.log(`[INFO] Sonarr:     ${config.sonarrUrl || '(not configured)'}`);
  console.log(`[INFO] Radarr:     ${config.radarrUrl || '(not configured)'}`);
  console.log(`[INFO] Jellyseerr: ${config.jellyseerrUrl || '(not configured)'}`);
  console.log(`[INFO] Plex:       ${config.plexToken ? '(configured)' : '(not configured)'}`);
});
