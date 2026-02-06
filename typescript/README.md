# HQ Bun Queue Server

Lightweight HTTP queue server built with Bun. It stores tasks in memory, lets workers fetch tasks, and tracks task state (`queued`, `running`, `success`, `error`, `lost`).

## Requirements

- Bun (project currently uses Bun v1.3.x)

## Install

```bash
bun install
```

## Run

```bash
bun run server.ts
```

By default, the server listens on `http://localhost:3000`.

## Environment variables

The server reads these variables at startup:

- `HQ_SERVER_PORT` (default: `3000`)
- `HQ_WORKER_TIMEOUT` in milliseconds (default: `30000`)
- `HQ_LOG_LEVEL` (default: `info`)

### Steer variables for one run

```bash
HQ_SERVER_PORT=3100 HQ_WORKER_TIMEOUT=10000 HQ_LOG_LEVEL=debug bun run server.ts
```

### Steer variables with `.env`

Create a `.env` file:

```env
HQ_SERVER_PORT=3100
HQ_WORKER_TIMEOUT=10000
HQ_LOG_LEVEL=debug
```

Then run:

```bash
bun run server.ts
```
