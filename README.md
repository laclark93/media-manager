# Missing Media Dashboard

A self-hosted dashboard for monitoring your media library. Integrates with Sonarr, Radarr, Jellyseerr, and Plex to give you a single view of missing content, open issues, and anime quality checks.

## Features

- **Shows & Movies** — lists monitored series and movies that are missing episodes or files, with staleness indicators
- **Issues** — surfaces open Jellyseerr issues with one-click search and resolve actions
- **Anime Check** — detects anime tag mismatches in Sonarr and Radarr (series flagged as anime without the tag, and vice versa)
- **Subtitle Check** — finds downloaded anime files with no English subtitle tracks, including files with only non-English audio and no subtitles at all
- **Activity Log** — persistent log of all search and action events
- **Ignored items** — anime mismatches and subtitle issues can be individually ignored (persisted server-side, shared across browsers)
- **Auto-refresh** — all checks refresh automatically every 15 minutes; the refresh button forces an immediate re-scan

## Running with Docker

The easiest way to run the dashboard is with Docker.

### Quick start

```bash
docker run -d \
  --name missing-media-dashboard \
  -p 3000:3000 \
  -v /path/to/config:/config \
  -e SONARR_URL=http://sonarr:8989 \
  -e SONARR_API_KEY=your-sonarr-api-key \
  -e RADARR_URL=http://radarr:7878 \
  -e RADARR_API_KEY=your-radarr-api-key \
  laclark93/missing-media-dashboard:latest
```

Then open `http://localhost:3000` in your browser. On first launch you will be prompted to set up a username and password.

### Docker Compose

```yaml
services:
  missing-media:
    image: laclark93/missing-media-dashboard:latest
    container_name: missing-media-dashboard
    ports:
      - "3000:3000"
    environment:
      - SONARR_URL=http://sonarr:8989
      - SONARR_API_KEY=your-sonarr-api-key
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=your-radarr-api-key
      # Optional
      - JELLYSEERR_URL=http://jellyseerr:5055
      - JELLYSEERR_API_KEY=your-jellyseerr-api-key
      - PLEX_TOKEN=your-plex-token
      - PORT=3000
    volumes:
      - ./config:/config
    restart: unless-stopped
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `SONARR_URL` | Yes | Base URL of your Sonarr instance |
| `SONARR_API_KEY` | Yes | Sonarr API key |
| `RADARR_URL` | Yes | Base URL of your Radarr instance |
| `RADARR_API_KEY` | Yes | Radarr API key |
| `JELLYSEERR_URL` | No | Base URL of your Jellyseerr instance |
| `JELLYSEERR_API_KEY` | No | Jellyseerr API key |
| `PLEX_TOKEN` | No | Plex authentication token (enables subtitle detail view) |
| `PORT` | No | Port to listen on (default: `3000`) |
| `DATA_DIR` | No | Directory for persistent data (default: `/config`) |
| `VERBOSE_LOGGING` | No | Enable verbose/trace log output (default: `true`, set to `false` to disable) |

### Persistent data

The `/config` volume stores:
- `settings.json` — service URLs and API keys configured via the Settings page
- `ignored.json` — items marked as ignored on the Anime page
- `activity-log.json` — the activity log shown on the Log page

Mount this volume to a host directory or named volume to preserve data across container updates.

## Building from source

```bash
# Clone the repo
git clone https://github.com/laclark93/media-manager.git
cd media-manager

# Install dependencies
npm ci --prefix client
npm ci --prefix server

# Build
npm run build --prefix client
npm run build --prefix server

# Run
NODE_ENV=production node server/dist/index.js
```
