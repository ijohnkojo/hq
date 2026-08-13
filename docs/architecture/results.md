# Results: shared-filesystem transport

Task **status** flows through the server; task **results** (the Python return
values) flow through a shared filesystem. This page explains the split.
Code: [`src/hq/util.py`](../../src/hq/util.py),
[`src/hq/worker/worker.py`](../../src/hq/worker/worker.py),
[`src/hq/client.py`](../../src/hq/client.py).

## Why results bypass Redis

Coffea task results are accumulators — histograms plus metrics that can reach
tens of MB per chunk. Pushing those through the HTTP status update would park
large blobs in Redis and on the wire for every task, for data that only the
one client ever reads. Instead the status carries a **pointer**, and the bytes
move over a filesystem both sides can see
([ADR 0004](../adr/0004-results-on-shared-fs.md)).

## The path of a result

1. `exe.py` runs the task and puts the base64-cloudpickled return value into
   the IPC JSON as `taskResult`.
2. The parent worker **pops `taskResult` out** of the IPC dict — it must never
   reach the HTTP status update.
3. On success, the worker writes it to:

   ```text
   {HQ_RESULT_DIR}/{queue}/{task_id}.pkl        (default root: /tmp/hq-results)
   ```

   and adds `taskInfo.resultPath = "{queue}/{task_id}.pkl"` — a **relative
   key**, so client and workers may mount the result directory at different
   absolute paths.
4. The worker POSTs the (small) status to the server.
5. The client's `gather()` reads `resultPath` from the status, resolves it
   against its own `HQ_RESULT_DIR` (`resolve_result_path` also accepts
   absolute paths), and deserializes the pickle.

## Client API semantics

| Call | Blocks? | Returns | Notes |
|------|---------|---------|-------|
| `check(*ids)` | no | statuses (or `None` for unknown IDs) | metadata only |
| `wait(*ids)` | yes | statuses | polls until every task is terminal (`success`/`error`/`lost`) |
| `gather(*ids)` | no | actual return values | tasks must already be terminal; loads pickles |
| `wait_and_gather(*ids)` | yes | actual return values | `wait` then `gather` |

`gather` raises `RuntimeError` on the first non-success status:

- `error` → `RuntimeError(f"Task {id}: {errorType}: {errorMessage}")` — the
  worker-side exception type and message, e.g.
  `Task 491: ModuleNotFoundError: No module named 'ttbar_processor'`.
- `lost` → `RuntimeError(f"Task {id}: lost")`.
- `success` without `resultPath`, or a non-terminal status → `RuntimeError`
  explaining what went wrong (the latter means you forgot to `wait`).

Results are returned in input order, so `wait_and_gather(*task_ids)` lines up
with the arguments passed to `map`.

## Deployment requirement

**Client and every worker must share `HQ_RESULT_DIR`.** On one machine the
default `/tmp/hq-results` just works. Across machines (HTCondor, a facility)
it must be a shared mount (NFS, CephFS, ...) and the env var must be set for
both the client process and each worker before they start. If a worker writes
where the client cannot read, `wait` succeeds but `gather` fails on a missing
file.

Nothing cleans this directory automatically — prune old queue subdirectories
periodically (each run of `HQExecutor` uses a fresh UUID queue name, so old
results are inert but accumulate).

## Related

- [Task lifecycle](task-lifecycle.md) — what the status does carry
- [Worker internals](worker.md) — the strip-and-write step
- [ADR 0004](../adr/0004-results-on-shared-fs.md)
- [Configuration](../ops/configuration.md) — `HQ_RESULT_DIR`
