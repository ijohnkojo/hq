# ADR 0006: One subprocess per task via exe.py

**Status:** Accepted

## Context

The worker's process loop could execute tasks in-process (deserialize and
call). That is fastest, but a segfault, OOM kill, or `sys.exit` inside user
code would take down the worker; and every task would be locked to the
worker's interpreter and environment.

## Decision

Each task runs as a fresh subprocess:

```text
<sys.executable> src/hq/worker/exe.py <taskId> <payloadPath>
```

- `sys.executable` — the worker's own interpreter, not whatever `python`
  resolves to on PATH, so tasks see the same environment (e.g. `coffea_env`)
  as the worker.
- [`exe.py`](../../src/hq/worker/exe.py) is a standalone script: it
  bootstraps `<repo>/src` onto `sys.path`, deserializes the payload,
  executes, and reports via the stderr IPC contract
  ([ADR 0007](0007-stderr-last-line-ipc.md)).
- The payload travels via a temp file (ARG_MAX; inline JSON still accepted
  for manual runs).

## Consequences

- Crash isolation: a dying task yields an `error`/parse failure for that task
  only; the worker loop keeps pulling.
- Per-task environment swapping is possible by construction — the launch
  command could become `uv run --with ... exe.py ...` or
  `source setup.sh && python exe.py ...` per task, without touching the
  protocol.
- Debuggability: any payload can be re-run by hand
  (`python exe.py 1 payload.json`) to reproduce a failure outside the queue.
- Cost: interpreter startup + full import chain (coffea imports are seconds)
  per task. Acceptable for multi-second analysis chunks; a persistent task
  runner could be introduced later if small-task throughput ever matters.
- Task runtime as reported excludes deserialization (measured around the call
  itself), so `runtime` reflects user work.
