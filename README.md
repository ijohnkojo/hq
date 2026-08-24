# hq (hep-queue)

A small **pull-based task queue** for distributing Python work — built to run
HEP analysis (coffea) chunks, but generic at its core.

Redis stores the work. A [Bun](https://bun.com) HTTP server is a thin facade
over Redis. Python clients submit cloudpickled callables; Python workers fetch
and run them, one subprocess per task. Results come back over a shared
filesystem.

## Why pull-based?

Contrary to dask-distributed-like systems, the server does **not** track a
worker pool and does **not** push tasks. Workers connect to the HTTP server
and fetch work continuously until nothing is left:

- workers can join and leave freely (ideal for HTCondor slots) — nothing but
  the server URL and a queue name is needed;
- the server stays a stateless facade: no placement logic, no scheduler
  bottleneck, much less networking chatter;
- load balancing is emergent — whichever worker polls first gets the next
  FIFO task.

The tradeoff: task pickup latency is bounded by the poll interval (~1 s) and
there is no locality-aware scheduling — irrelevant for multi-second analysis
chunks. Full reasoning: [ADR 0001](docs/adr/0001-pull-based-workers.md).

The HTTP server can be viewed as a very simplified message queue (like
RabbitMQ).

## Quickstart

Uses [`bun`](https://bun.com) and [`uv`](https://docs.astral.sh/uv/).

1. Start Redis (or [dragonfly](https://github.com/dragonflydb/dragonfly), a
   drop-in replacement) at `redis://localhost:6379` (configurable via
   `HQ_REDIS_URL`):

```shell
redis-server --port 6379
```

2. Start the queue server:

```shell
bun run typescript/server.ts
```

3. Run work through it — the `HQExecutor` context manages a queue, local
   workers, and waiting in one block:

```python
from hq.executor import HQExecutor

def double(i: int) -> int:
    return i * 2

with HQExecutor(host="http://localhost", port=3000, n_workers=2) as ex:
    task_ids = ex.map(double, range(10))
    results = ex.wait_and_gather(*task_ids)   # (0, 2, 4, ..., 18)
```

Or drive the pieces manually (separate client and worker processes):

```shell
uv run example/simple/client.py            # submits tasks, prints the queue name
uv run example/simple/worker.py <queue>    # one or more workers, any machine
```

For an end-to-end smoke test of everything (including HTTPS), run
[`./scripts/testrun.sh`](scripts/testrun.sh).

## TLS (HTTPS)

The single HTTP boundary can be encrypted with a self-signed cert and two env
vars — no CA infrastructure:

```shell
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

HQ_SERVER_KEY_FILE=key.pem HQ_SERVER_CERT_FILE=cert.pem bun run typescript/server.ts
```

Clients and workers take a `verify` argument (forwarded to `requests`):
`verify="cert.pem"` trusts that specific cert (dev), `verify=True` uses the
system CA bundle (real certs), `verify=False` disables verification (insecure,
dev only). Plain `http://` keeps working when TLS is not configured. Details:
[ADR 0003](docs/adr/0003-tls-self-signed-certs.md) and the
[deployment guide](docs/ops/deployment.md).

## Running coffea on hq

`CoffeaHQExecutor` is a drop-in executor for `coffea.processor.Runner` —
one hq task per chunk, results merged with `processor.accumulate`:

```python
from hq.coffea import CoffeaHQExecutor

executor = CoffeaHQExecutor(
    host="https://localhost", port=3000, verify="cert.pem",
    n_workers=8,
    pickle_modules=(utils, ttbar_processor),  # ship notebook-local modules
)
```

See [CoffeaHQExecutor](docs/architecture/coffea-executor.md) — including why
`pickle_modules` matters. A full AGC ttbar pipeline that exercises hq
end-to-end (and compares it against `FuturesExecutor`) lives in the separate
`agc-hq` repo, which installs hq as a package (`pip install -e ../hq`).

## Documentation

Full index: [docs/index.md](docs/index.md).

| Section | Contents |
|---------|----------|
| [Architecture](docs/architecture/overview.md) | System [overview](docs/architecture/overview.md), [task lifecycle](docs/architecture/task-lifecycle.md), [worker internals](docs/architecture/worker.md), [results transport](docs/architecture/results.md), [coffea executor](docs/architecture/coffea-executor.md) |
| [ADRs](docs/index.md#architecture-decision-records) | Why pull-based, why an HTTP facade, TLS, shared-FS results, cloudpickle-by-value, subprocess-per-task, stderr IPC, worker teardown |
| [Operations](docs/ops/deployment.md) | [Deployment](docs/ops/deployment.md) (systemd, health checks, facilities), [configuration reference](docs/ops/configuration.md), [troubleshooting](docs/ops/troubleshooting.md) |

## Repository layout

| Path | Role |
|------|------|
| `src/hq/` | Python package: client, executor, worker, coffea integration |
| `typescript/` | Bun queue server (routes, Redis state, TLS config) |
| `example/` | Simple examples + AGC ttbar notebooks and comparison scripts |
| `scripts/testrun.sh` | End-to-end HTTPS smoke test |
| `docs/` | Documentation ([index](docs/index.md)) and working notes |
