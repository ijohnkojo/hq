# Deployment guide

How to stand up the full hq stack: Redis, the Bun server (with TLS), and
workers — locally, under systemd, or at a facility (coffea-casa style).

*Last verified: 2026-08 (Python 3.12 / coffea_env, Bun 1.3.x, coffea 2025.x).*

## Prerequisites

| Component | Needs |
|-----------|-------|
| Server | [Bun](https://bun.com) 1.2.3+ (routes API); Redis 6+ or [Dragonfly](https://github.com/dragonflydb/dragonfly) |
| Client & workers | Python ≥ 3.12 with `requests` + `cloudpickle` (the `hq` package); for coffea work also coffea, awkward, uproot, etc. |
| Cross-machine runs | A shared filesystem for `HQ_RESULT_DIR`; the TLS cert file readable everywhere |

Use the **same Python environment** for client and workers whenever possible —
task subprocesses run under the worker's `sys.executable`, and cloudpickle
by-value does not ship third-party dependencies.

For a scripted end-to-end bring-up (all steps below, then a smoke workload),
run [`scripts/testrun.sh`](../../scripts/testrun.sh) from the repo root.

## Step-by-step bring-up

### 1. Redis

```shell
redis-server --port 6379
```

or Dragonfly (drop-in):

```shell
docker run -p 6379:6379 --ulimit memlock=-1 docker.dragonflydb.io/dragonflydb/dragonfly
```

Bind to localhost — only the Bun server talks to Redis
([ADR 0002](../adr/0002-http-facade-over-redis.md)). Point the server elsewhere
with `HQ_REDIS_URL`.

### 2. TLS certificate (skip for plain-HTTP dev)

Self-signed, valid for localhost:

```shell
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

For a real host, put its DNS name/IP in the SAN — clients verify against it.
Details and the `verify=` contract:
[ADR 0003](../adr/0003-tls-self-signed-certs.md).

### 3. Queue server

```shell
HQ_SERVER_KEY_FILE=key.pem HQ_SERVER_CERT_FILE=cert.pem \
  bun run typescript/server.ts
```

Startup logs to expect:

```text
✔  Redis client initialized, connected to redis://localhost:6379
ℹ  Found TLS files at key.pem (key) and cert.pem (cert)
✔  hq-server running at https://localhost:3000
```

Without the TLS env vars it serves `http://` on the same port. All server env
vars are listed in [configuration.md](configuration.md).

### 4. Result directory

```shell
export HQ_RESULT_DIR=/tmp/hq-results     # default; use a shared mount across machines
mkdir -p "$HQ_RESULT_DIR"
```

### 4b. Histserv (optional)

Only needed when using the remote histogram transport
([histserv.md](../architecture/histserv.md)):

```shell
histserv --port 50051
```

Keep it on the same trusted network as Redis — the gRPC channel is not TLS.
Workers need `histserv` installed in the same env as the client
(`pip install histserv` or `pip install 'hq[histserv]'`).

Set this for **both** the client process and every worker
([ADR 0004](../adr/0004-results-on-shared-fs.md)). Prune old queue
subdirectories periodically — nothing cleans them automatically.

### 5. Workers

**Managed (single machine, simplest).** Let the executor spawn and kill them:

```python
with HQExecutor(host="https://localhost", port=3000,
                verify="cert.pem", n_workers=8) as ex:
    ...
```

**External (HTCondor / long-lived).** Start workers yourself against a pinned
queue name and pass `manage_workers=False` on the client:

```python
# worker job (one per slot)
from hq.worker import HQWorker, run
run(HQWorker(host="https://hq.example.org", port=3000,
             queue="my-analysis-queue", fetch_n_tasks=3,
             verify="/shared/cert.pem"))
```

```python
# client
HQExecutor(host="https://hq.example.org", port=3000,
           queue="my-analysis-queue", manage_workers=False,
           verify="/shared/cert.pem")
```

External workers poll forever (quiet when idle); their lifecycle belongs to
the batch system, not the client.

## systemd

`/etc/hq/hq.env`:

```ini
HQ_SERVER_PORT=3000
HQ_SERVER_KEY_FILE=/etc/hq/key.pem
HQ_SERVER_CERT_FILE=/etc/hq/cert.pem
HQ_REDIS_URL=redis://localhost:6379
HQ_WORKER_TIMEOUT=30000
HQ_RESULT_DIR=/shared/hq-results
```

`/etc/systemd/system/hq-server.service`:

```ini
[Unit]
Description=hq queue server
After=network.target redis-server.service
Requires=redis-server.service

[Service]
EnvironmentFile=/etc/hq/hq.env
WorkingDirectory=/opt/hq
ExecStart=/usr/local/bin/bun run typescript/server.ts
Restart=on-failure
User=hq

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/hq-worker@.service` (template; start with
`systemctl start hq-worker@1 hq-worker@2 ...`):

```ini
[Unit]
Description=hq worker %i
After=hq-server.service

[Service]
EnvironmentFile=/etc/hq/hq.env
WorkingDirectory=/opt/hq
ExecStart=/opt/conda/envs/coffea_env/bin/python -c "\
from hq.worker import HQWorker, run; \
import os; \
run(HQWorker(host='https://localhost', port=int(os.environ.get('HQ_SERVER_PORT', 3000)), \
             queue=os.environ['HQ_QUEUE'], verify=os.environ['HQ_SERVER_CERT_FILE']))"
Environment=PYTHONPATH=/opt/hq/src
Environment=HQ_QUEUE=facility-default
Restart=on-failure
KillMode=control-group
User=hq

[Install]
WantedBy=multi-user.target
```

`KillMode=control-group` matters: a worker is a small process tree (heartbeat
+ process loop + task subprocesses) and all of it must die on stop.

## Health checks

**Server liveness:**

```shell
curl --cacert cert.pem https://localhost:3000/status   # -> OK
```

**Healthy worker heartbeat** — server logs one line per worker per second:

```text
ℹ  Received heartbeat from worker myhost-12345
```

and `workers:health` in Redis holds a fresh (< `HQ_WORKER_TIMEOUT` ms)
timestamp per worker:

```shell
redis-cli hgetall workers:health
```

**Unhealthy** — a worker that stops heartbeating triggers, after the timeout
(default 30 s), the lost-task sweep:

```text
⚠  Worker myhost-12345 timed out after 31005ms (threshold 30000ms), marked 2 task(s) as lost
```

Those tasks show status `lost` to the client (`gather` raises); resubmission
is the client's call. See
[task-lifecycle.md](../architecture/task-lifecycle.md).

**End-to-end**: `./scripts/testrun.sh` exercises redis → TLS server → workers
→ client and exits non-zero on failure; logs land in a temp directory it
prints.

## Facility notes (coffea-casa style)

- `HQ_RESULT_DIR` must be a mount shared by the notebook node and every worker
  node, set in both environments before processes start.
- Environment parity: workers need the full analysis stack (coffea, awkward,
  uproot, correctionlib, ...). Same conda env everywhere is the simplest
  invariant; cloudpickle-by-value only covers *your* modules
  ([ADR 0005](../adr/0005-cloudpickle-by-value.md)).
- Distribute `cert.pem` to worker nodes (shared FS path is fine) and pass it
  as `verify=`.
- Pin one queue name per analysis campaign so Condor-submitted workers and the
  notebook agree; the client generates a random UUID queue otherwise.
- Common failure modes and their signatures:
  [troubleshooting.md](troubleshooting.md).

## Related

- [Configuration reference](configuration.md)
- [Troubleshooting](troubleshooting.md)
- [Architecture overview](../architecture/overview.md)
