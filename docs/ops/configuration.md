# Configuration reference

Every environment variable and constructor knob in one place.

*Last verified: 2026-08 (Python 3.12 / coffea_env, Bun 1.3.x, coffea 2025.x).*

## Server environment variables

Read once at startup by [`typescript/config.ts`](../../typescript/config.ts)
(directly or via a `.env` file in `typescript/`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `HQ_SERVER_PORT` | `3000` | Port the Bun server listens on |
| `HQ_WORKER_TIMEOUT` | `30000` | Heartbeat timeout in ms; workers silent longer than this get their `running` tasks marked `lost` |
| `HQ_LOG_LEVEL` | `info` | Server log verbosity |
| `HQ_SERVER_KEY_FILE` | unset | TLS private key path; HTTPS is enabled only when **both** key and cert are set and exist |
| `HQ_SERVER_CERT_FILE` | unset | TLS certificate path |
| `HQ_REDIS_URL` | `redis://localhost:6379` | Redis connection string |

## Client / worker environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `HQ_RESULT_DIR` | `/tmp/hq-results` | Root of the shared result store; must be set (or defaulted identically) for the client **and** every worker. Results land at `{HQ_RESULT_DIR}/{queue}/{task_id}.pkl` |

Optional histserv transport (not an hq env var — a gRPC service next to Redis):

| Setting | Default | Meaning |
|---------|---------|---------|
| `histserv --port` | `50051` | Histogram server; workers fill, client snapshots. See [histserv.md](../architecture/histserv.md) |
| notebook `USE_HISTSERV` | `False` | Off = pickled hists on the shared FS; on = remote fills |
| notebook `HISTSERV_ADDRESS` | `localhost:50051` | gRPC address passed to `init_remote_hists` |

## Python constructor arguments

### `HQExecutor` ([`src/hq/executor.py`](../../src/hq/executor.py))

| Argument | Default | Meaning |
|----------|---------|---------|
| `host` | `"http://localhost"` | Server URL including scheme (`https://...` for TLS) |
| `port` | `3000` | Server port |
| `queue` | generated UUID | Queue name; pin it when external workers must find the work |
| `n_workers` | `2` | Managed workers to spawn on `__enter__` (ignored unless `manage_workers`) |
| `fetch_n_tasks` | `3` | Tasks each worker may claim per pull |
| `verify` | `None` (→ `True`) | TLS verification: `True` system CAs, `"path/cert.pem"` specific cert, `False` off (insecure) |
| `manage_workers` | `True` | Spawn/kill local workers with the context; `False` for external (Condor) workers |

Methods: `submit`, `map`, `check`, `wait(poll_interval=3.0)`, `gather`,
`wait_and_gather`, `map_and_wait`.

### `CoffeaHQExecutor` ([`src/hq/coffea.py`](../../src/hq/coffea.py))

All `HQExecutor` connection knobs (`host`, `port`, `verify`, `n_workers`,
`queue`, `manage_workers`), plus:

| Argument | Default | Meaning |
|----------|---------|---------|
| `pickle_modules` | `()` | Modules to register by value with cloudpickle — every notebook-local module the processor uses (e.g. `(utils, ttbar_processor)`) |
| `poll_interval` | `3.0` | Client status-poll interval in seconds |
| `compression` | `None` | Coffea result compression; hq keeps it off (results travel as pickles on the shared FS) |

### `HQWorker` ([`src/hq/worker/worker.py`](../../src/hq/worker/worker.py))

| Argument | Default | Meaning |
|----------|---------|---------|
| `host`, `port` | — | Server URL and port |
| `queue` | required | Queue to pull from (non-empty) |
| `worker_id` | `{hostname}-{pid}` | Identity used for heartbeats and task ownership |
| `fetch_n_tasks` | `1` | Max tasks per pull |
| `verify` | `None` (→ `True`) | Same TLS contract as the client |

### `HQClient` ([`src/hq/client.py`](../../src/hq/client.py))

`host`, `port`, `queue`, `verify` — as above. Usually wrapped by
`HQExecutor`.

## `scripts/testrun.sh` knobs

Overridable via environment when invoking the end-to-end smoke:

| Variable | Default | Meaning |
|----------|---------|---------|
| `EXAMPLE` | `simple` | Which `example/<EXAMPLE>/{client,worker}.py` pair to run (`simple` or `dynamic`) |
| `WORKERS` | `2` | Worker processes to spawn |
| `HQ_PORT` | `3000` | Server port |
| `CERT_FILE` / `KEY_FILE` | `cert.pem` / `key.pem` | TLS files (generated if absent) |
| `HQ_REDIS_URL` | `redis://localhost:6379` | Redis to use (started if not reachable) |
| `HQ_QUEUE` | generated | Pin the shared queue name |

## Sizing guidance

- `n_workers` ≈ physical cores for CPU-bound coffea processing; a few more
  when chunks block on remote I/O (xrootd). Each worker runs its claimed tasks
  sequentially — parallelism comes from worker count.
- `Runner(chunksize=...)`: one hq task per coffea chunk. Fewer/larger chunks
  cut per-task overhead (subprocess spawn + imports + pickle round-trip) but
  reduce parallelism and raise per-task memory.
- `Runner(maxchunks=1)` for smoke tests only.
- `HQ_WORKER_TIMEOUT`: raise it if healthy-but-loaded machines cause spurious
  `lost` tasks (heartbeats are 1 s; the default tolerates 30 missed ones).

## Related

- [Deployment guide](deployment.md)
- [Troubleshooting](troubleshooting.md)
- [CoffeaHQExecutor](../architecture/coffea-executor.md)
- [HistServ](../architecture/histserv.md)
