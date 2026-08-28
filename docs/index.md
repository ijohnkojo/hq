# hq documentation

Start at the repo [README](../README.md) for what hq is and a quickstart.
Everything else is indexed here — a doc not linked on this page effectively
does not exist, so add new docs below.

## Architecture

How the pieces work and talk to each other.

| Doc | One-liner |
|-----|-----------|
| [Overview](architecture/overview.md) | The three long-lived pieces (Redis, Bun server, Python), system diagram, Redis key model, HTTP endpoints |
| [Task lifecycle](architecture/task-lifecycle.md) | `queued → running → success/error/lost`, submit vs map, heavy-payload dedup, lost-task recovery |
| [Worker internals](architecture/worker.md) | Pull loop, one-subprocess-per-task via `exe.py`, stderr IPC contract, managed teardown |
| [Results](architecture/results.md) | Shared-filesystem result transport: `HQ_RESULT_DIR`, `resultPath` pointer, `gather` semantics |
| [CoffeaHQExecutor](architecture/coffea-executor.md) | Running `coffea.processor.Runner` on hq: `pickle_modules`, sizing, AGC benchmarks |
| [HistServ](architecture/histserv.md) | Optional remote histogram transport: workers fill a gRPC hist server, client snapshots |

## Architecture Decision Records

Why things are the way they are. Numbered and append-only: a changed decision
gets a new ADR that supersedes the old one, never an edit.

| ADR | Decision |
|-----|----------|
| [0001](adr/0001-pull-based-workers.md) | Pull-based workers over push scheduling |
| [0002](adr/0002-http-facade-over-redis.md) | HTTP facade (Bun) instead of direct Redis access |
| [0003](adr/0003-tls-self-signed-certs.md) | TLS via cert files + `verify=` passthrough |
| [0004](adr/0004-results-on-shared-fs.md) | Task results on a shared filesystem, pointer in status |
| [0005](adr/0005-cloudpickle-by-value.md) | Ship analysis code by value with cloudpickle |
| [0006](adr/0006-subprocess-per-task.md) | One subprocess per task via `exe.py` |
| [0007](adr/0007-stderr-last-line-ipc.md) | stderr last-line JSON IPC |
| [0008](adr/0008-managed-worker-teardown.md) | Managed-worker lifecycle via process groups |

## Operations

Standing hq up and keeping it healthy.

| Doc | One-liner |
|-----|-----------|
| [Deployment guide](ops/deployment.md) | Redis → TLS cert → Bun server → workers; systemd units; health checks; facility notes |
| [Configuration reference](ops/configuration.md) | Every env var and constructor knob, with defaults and sizing guidance |
| [Troubleshooting](ops/troubleshooting.md) | Symptom → cause → fix, from real failures |

## Examples

| Path | What it shows |
|------|---------------|
| [`example/simple/client_ex.py`](../example/simple/client_ex.py) | Minimal `HQExecutor`: submit, map, wait |
| [`scripts/testrun.sh`](../scripts/testrun.sh) | One-command end-to-end smoke over HTTPS |
| [`example/coffea_hq_smoke.py`](../example/coffea_hq_smoke.py) | `CoffeaHQExecutor` smoke with fake items (no ROOT) |
| [`example/histserv_hq_smoke.py`](../example/histserv_hq_smoke.py) | Ship a histserv `RemoteHist` through an hq task |
| `agc-hq` repo (sibling checkout, e.g. `../agc-hq`) | Full AGC ttbar pipeline on hq: notebooks, `agc_hq_vs_futures.py` / `agc_histserv_vs_futures.py` comparison, `Runner` smoke |


