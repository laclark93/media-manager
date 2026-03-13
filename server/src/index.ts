import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './config.js';
import * as log from './logger.js';
import sonarrRouter from './routes/sonarr.js';
import radarrRouter from './routes/radarr.js';
import settingsRouter from './routes/settings.js';
import jellyseerrRouter from './routes/jellyseerr.js';
import plexRouter from './routes/plex.js';
import authRouter from './routes/auth.js';
import persistenceRouter from './routes/persistence.js';
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
    const manual = req.headers['x-manual-refresh'] === '1' ? ' [MANUAL]' : '';
    const qs = Object.keys(req.query).length ? `?${new URLSearchParams(req.query as Record<string, string>)}` : '';
    const msg = `${manual} ${req.method} ${req.path}${qs} → ${res.statusCode} (${ms}ms)`;
    if (res.statusCode >= 500) log.error(msg);
    else if (res.statusCode >= 400) log.warn(msg);
    else log.info(msg);
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
app.use('/api/persistence', persistenceRouter);

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
  log.info(`Missing Media Dashboard v${process.env.npm_package_version || 'dev'} running on port ${config.port}`);
  log.info(`Verbose logging: ${log.isVerbose() ? 'ON' : 'OFF'} (set VERBOSE_LOGGING=false to disable)`);
  if (config.sonarrInstances.length === 0) log.info('Sonarr:     (not configured)');
  else config.sonarrInstances.forEach(i => log.info(`Sonarr:     ${i.name} → ${i.url}`));
  if (config.radarrInstances.length === 0) log.info('Radarr:     (not configured)');
  else config.radarrInstances.forEach(i => log.info(`Radarr:     ${i.name} → ${i.url}`));
  log.info(`Jellyseerr: ${config.jellyseerrUrl || '(not configured)'}`);
  log.info(`Plex:       ${config.plexToken ? '(configured)' : '(not configured)'}`);
});
