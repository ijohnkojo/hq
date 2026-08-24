# ADR 0004: Task results on a shared filesystem, pointer in the status

**Status:** Accepted

## Context

Task return values in coffea workloads are accumulators (histograms +
metrics), commonly MBs to tens of MBs per chunk. Carrying them in the
`POST /tasks/status` body would store every result in Redis and push it
through the HTTP server twice, for data only one client ever reads. Redis is
a poor blob store and the facade should stay light.

HEP facilities reliably provide a shared filesystem between interactive nodes
and batch workers.

## Decision

Results never touch the server. The worker:

1. receives the serialized result from `exe.py` (IPC field `taskResult`),
2. strips it from the status update,
3. writes it to `{HQ_RESULT_DIR}/{queue}/{task_id}.pkl`
   (default root `/tmp/hq-results`),
4. reports only `taskInfo.resultPath = "{queue}/{task_id}.pkl"` — a relative
   key, resolved by the client against its own `HQ_RESULT_DIR`.

`HQClient.gather` loads the pickle for each `success` status and raises on
`error`/`lost`.

## Consequences

- Redis and the HTTP path stay small and fast regardless of result size.
- **New deployment requirement:** client and all workers must share
  `HQ_RESULT_DIR` (same machine or shared mount) — the most common source of
  confusing failures when forgotten (see
  [troubleshooting](../ops/troubleshooting.md)).
- Relative keys tolerate different mount points on client vs workers.
- No automatic cleanup; result directories accumulate and need periodic
  pruning.
- A future HistServ-style aggregation service could replace file transport
  for histogram fills without changing task status semantics.
