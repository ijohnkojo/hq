# ADR 0001: Pull-based workers over push scheduling

**Status:** Accepted

## Context

Distributed executors used in HEP (dask-distributed being the reference point)
are push-based: a central scheduler tracks a worker pool, decides placement,
and pushes tasks to workers. That gives fine-grained scheduling but costs
constant bidirectional chatter, scheduler state proportional to the cluster,
and a scheduler that must handle every worker joining, leaving, or dying.

hq targets batch-style analysis workloads (coffea chunks) where tasks are
independent, ordering within a queue is FIFO-fine, and workers may come and go
freely (e.g. HTCondor slots).

## Decision

Workers **pull**. The server holds per-queue FIFO lists in Redis and answers
`GET /tasks/fetch/{workerId}/{queue}/{n}`; it never initiates contact with a
worker and keeps no worker-pool model beyond a heartbeat timestamp map used
only for lost-task detection. Load balancing is emergent: whichever worker
polls first gets the next tasks (`RPOP`).

## Consequences

- Workers can be started anywhere, any time, with nothing but the server URL
  and a queue name — ideal for HTCondor-submitted workers.
- No scheduler bottleneck or scheduler-side placement logic; the server is a
  thin stateless facade over Redis.
- Idle workers poll (1 s sleep between empty fetches) — a small constant
  background load instead of push latency.
- No locality-aware or priority scheduling; if that is ever needed it must be
  layered on (multiple queues, weighted polling).
- Task-to-worker latency is bounded by the poll interval rather than being
  push-immediate; irrelevant for multi-second analysis chunks.
