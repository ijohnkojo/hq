# Troubleshooting

Symptom → cause → fix. Every entry below was hit for real while bringing the
AGC coffea workload onto hq.

*Last verified: 2026-08 (Python 3.12 / coffea_env, Bun 1.3.x, coffea 2025.x).*

## Tasks fail instantly with ModuleNotFoundError

**Symptom.** Preprocessing tasks succeed, then every processing task finishes
`error` in well under a millisecond (e.g. `took 0.0004s`). `gather`/
`wait_and_gather` raises:

```text
RuntimeError: Task 491: ModuleNotFoundError: No module named 'ttbar_processor'
```

**Cause.** The task pickle references a notebook-local module by import, but
the worker's fresh interpreter cannot import it. The unpickle fails before any
real work starts — hence the sub-millisecond runtime.

**Fix.** Ship the module by value: add it to
`CoffeaHQExecutor(pickle_modules=(utils, ttbar_processor))` and/or call
`cloudpickle.register_pickle_by_value(mod)` before submitting. See
[ADR 0005](../adr/0005-cloudpickle-by-value.md).

## Client hangs in wait() although the worker printed success

**Symptom.** Worker stdout shows `Task N finished with 'success'` but the
client polls forever.

**Cause.** The worker crashed (or was killed) between running the task and
POSTing the status — or, on old versions, library warnings on stderr broke the
IPC JSON parse so the status POST never happened (fixed by the last-line
contract, [ADR 0007](../adr/0007-stderr-last-line-ipc.md)).

**Fix.** Check the worker process is alive and its logs for
`stderr IPC is not JSON` / `produced no stderr IPC`. If the worker died, the
server will mark the task `lost` after `HQ_WORKER_TIMEOUT` and `wait()` will
return.

## gather() fails: missing result file or "success but no resultPath"

**Symptom.**

```text
RuntimeError: Task 42: success but no resultPath in info
FileNotFoundError: .../hq-results/<queue>/42.pkl
```

**Cause.** Client and workers do not share `HQ_RESULT_DIR` — different
machines without a shared mount, or the env var set on one side only, so the
worker wrote where the client cannot read.

**Fix.** Set `HQ_RESULT_DIR` to a shared path in **both** environments before
starting workers and client; `mkdir -p` it. See
[results.md](../architecture/results.md).

## Tasks stuck in queued forever

**Symptom.** `check()` returns `queued` indefinitely; no worker logs any
fetch.

**Cause.** No worker is polling that queue name. Typical: client generated a
random UUID queue but external workers were started with a different (or no)
pinned name; or workers point at the wrong server/port.

**Fix.** Pin one queue name on both sides (`HQExecutor(queue=...)`, worker
`HQWorker(queue=...)`), or use managed workers. Confirm with
`redis-cli lrange tasks:queue:<name> 0 -1`.

## Tasks end up lost

**Symptom.** Server log:

```text
⚠  Worker myhost-12345 timed out after 31005ms (threshold 30000ms), marked 2 task(s) as lost
```

`gather` raises `RuntimeError: Task N: lost`.

**Cause.** The worker stopped heartbeating: it crashed/OOMed, the machine is
overloaded enough to starve the 1 s heartbeat loop, or the network dropped.

**Fix.** Check worker host health and memory; raise `HQ_WORKER_TIMEOUT` if
machines are healthy but loaded. Lost tasks are not retried automatically —
resubmit from the client.

## TLS errors (SSLError, certificate verify failed, connection reset)

**Symptom.** `requests.exceptions.SSLError` on any client/worker call, or
curl failing against `/status`.

**Cause.** One of: `verify=` points at the wrong file (relative paths resolve
against the process **cwd** — a notebook running in `example/` needs
`../cert.pem`); the cert's CN/SAN does not match the host being dialed;
mixing `http://` and `https://` between client and server.

**Fix.** Use an absolute cert path where possible; regenerate the cert with a
SAN matching the host (`DNS:localhost,IP:127.0.0.1` locally); make sure the
scheme in `host=` matches how the server was started. Sanity check:
`curl --cacert cert.pem https://localhost:3000/status`. See
[ADR 0003](../adr/0003-tls-self-signed-certs.md).

## AttributeError: module 'uuid' has no attribute 'uuid7'

**Symptom.** Queue-name generation fails on Python 3.12.

**Cause.** `uuid.uuid7` exists only from Python 3.13.

**Fix.** Already handled — `generate_queue_name` in
[`src/hq/util.py`](../../src/hq/util.py) falls back to `uuid4`. If you see
this, your `hq` checkout predates the fix; update.

## Workers keep polling after the job is done

**Symptom.** Fetch activity continues after the client finished.

**Cause & fix.** With `manage_workers=False` this is **by design** — external
workers poll forever (quietly when idle) and are stopped by whatever launched
them. Managed workers are killed on context exit via process groups
([ADR 0008](../adr/0008-managed-worker-teardown.md)); if orphans survive,
your checkout predates the `setsid`/`killpg` teardown.

## Popen fails or the child sees a truncated payload (ARG_MAX)

**Symptom.** Task subprocess launch fails with `OSError: [Errno 7] Argument
list too long`, or `exe.py` errors on an empty/truncated payload — typically
with big coffea closures.

**Cause & fix.** Payloads used to be passed as one argv string, capped by
Linux `ARG_MAX` (~2 MB). Current workers write the payload to a temp file and
pass the path; if you hit this, update. Manual debugging still accepts inline
JSON: `python src/hq/worker/exe.py <id> '["...", "..."]'`.

## import hq fails on the worker or in task subprocesses

**Symptom.** `ModuleNotFoundError: No module named 'hq'` from a worker or
`exe.py`.

**Cause.** `hq` is not installed in that environment and `<repo>/src` is not
on the path. Fresh task subprocesses do not inherit a notebook's `sys.path`
hacks.

**Fix.** `exe.py` bootstraps its own `<repo>/src`, and the worker prepends it
to the subprocess `PYTHONPATH` — so running workers **from a repo checkout**
just works. For workers launched elsewhere, install `hq` into the env or set
`PYTHONPATH=<repo>/src` explicitly.

## Debugging one task by hand

Grab any payload (re-create it or capture the temp file) and run:

```shell
python src/hq/worker/exe.py 1 /path/to/payload.json
```

stdout shows the status line; the last stderr line is the IPC JSON with
`errorType`/`errorMessage` on failure. This bypasses the queue entirely —
ideal for reproducing unpickle and environment problems
([ADR 0006](../adr/0006-subprocess-per-task.md)).

## Related

- [Deployment guide](deployment.md) — healthy-state reference
- [Worker internals](../architecture/worker.md) — the mechanics behind these failures
- [Results](../architecture/results.md) — shared-FS requirement
