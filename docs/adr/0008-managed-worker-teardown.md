# ADR 0008: Managed-worker lifecycle via process groups

**Status:** Accepted

## Context

`HQExecutor(manage_workers=True)` spawns local worker processes for the
duration of a `with` block. Each worker itself spawns two children (heartbeat
loop, process loop) — which forces workers to be **non-daemon**, because
Python forbids daemonic processes from having children.

Naive teardown (`proc.terminate()` on the worker) killed only the parent: the
orphaned process-loop children kept polling the queue and printing fetch lines
long after the client had finished. Making the children daemonic instead was
not an option — the process loop spawns the per-task `exe.py` subprocesses
([ADR 0006](0006-subprocess-per-task.md)).

## Decision

- Each managed worker calls `os.setsid()` at startup, becoming the leader of
  its own process group containing all its children.
- `HQExecutor.__exit__` tears down with `os.killpg(pid, SIGTERM)`, a short
  `join`, then `os.killpg(pid, SIGKILL)` for stragglers, falling back to
  `terminate()`/`kill()` if the group is already gone.
- Complementary quality-of-life fixes in the pull loop: idle fetches are
  silent, and queue emptiness is detected as `not taskIds` (the HTTP body is
  always a 2-key dict, so `len(response) == 0` never fired).

## Consequences

- The whole worker tree dies promptly when the executor context exits; no
  post-run fetch spam, no orphan pollers holding the queue.
- This is **local process hygiene only** — it does not make the server track
  or manage workers, and the pull-queue philosophy is unchanged.
- `manage_workers=False` (HTCondor, long-lived external workers) is untouched:
  those workers poll forever and their lifecycle belongs to the batch system.
- `os.setsid`/`os.killpg` are POSIX-only; managed workers assume Linux/macOS.
