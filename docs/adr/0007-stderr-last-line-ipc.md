# ADR 0007: exe.py reports via last-line JSON on stderr

**Status:** Accepted

## Context

The `exe.py` subprocess must hand its outcome (status, metrics, serialized
result) back to the parent worker. Original implementation: print one JSON
object to stderr and `json.loads` the **entire** captured stderr.

Real coffea jobs broke this immediately — NanoAOD schema code emits
`RuntimeWarning`s on stderr while opening files, so the captured stream was
`warning lines + JSON` and parsing failed. The worker then never POSTed a
status and clients hung in `wait()` even though the task had finished.
Alternatives considered: a pipe/fd dedicated to IPC (more plumbing, harder to
run `exe.py` by hand), stdout (also polluted, and wanted for human logs), a
result file per task (the result already goes to a file; status is small and
per-task files would need their own cleanup).

## Decision

Keep stderr, but define the contract as: **the last non-empty line of stderr
is the IPC JSON**; anything above it (warnings, tracebacks printed by
libraries) is tolerated and ignored. `_parse_exe_ipc` in
[`src/hq/worker/worker.py`](../../src/hq/worker/worker.py) implements this and
raises a descriptive error if the last line is not JSON. stdout remains
human-readable logging only, and `exe.py` never prints result values (they can
be huge).

## Consequences

- Library warnings on stderr no longer break status reporting; the fix that
  unblocked real coffea runs.
- The contract is simple enough to satisfy by hand (`print(json.dumps(info),
  file=sys.stderr)` last), keeping manual `exe.py` runs easy.
- Anything a task prints to stderr **after** the IPC line would break parsing
  — by construction the JSON print is the final statement of `exe.py`, and the
  process exits right after.
- If a task hard-crashes before the IPC line (segfault), parsing fails with a
  clear "no stderr IPC (exit=N)" error and the task can be diagnosed by
  re-running its payload manually.
