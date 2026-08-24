# ADR 0005: Ship analysis code by value with cloudpickle

**Status:** Accepted

## Context

Workers run tasks in fresh interpreters that only bootstrap `hq` itself onto
the import path. Analysis code lives in notebook-local modules (`utils`,
`ttbar_processor`, ...) that are not installed anywhere. Options considered:
a code-distribution service (à la dask upload_file), requiring users to
package/install their analysis on every worker, or serializing the code into
the task payload.

Coffea's Dask pattern already answers this: the AGC notebooks call
`cloudpickle.register_pickle_by_value(utils)` so cloudpickle embeds module
code in the pickle instead of emitting an import reference.

## Decision

Reuse the cloudpickle-by-value pattern, made ergonomic via
`CoffeaHQExecutor(pickle_modules=(mod, ...))` /
`hq.coffea.register_modules_by_value`, which call
`cloudpickle.register_pickle_by_value` on each module before mapping. Task
payloads are already cloudpickle end-to-end (`serialize_obj` in
[`src/hq/util.py`](../../src/hq/util.py)), so no new transport was needed.

## Consequences

- Notebook-local code reaches workers with zero packaging or deployment steps;
  identical to the AGC Dask workflow.
- **Only registered modules are shipped.** Forgetting one produces
  sub-millisecond `error` tasks with `ModuleNotFoundError` at unpickle time —
  distinctive and easy to diagnose (see
  [troubleshooting](../ops/troubleshooting.md)).
- Third-party dependencies (coffea, awkward, uproot, correctionlib, ...) are
  **not** shipped; worker environments must have them installed. In practice:
  run workers from the same conda env as the client (`sys.executable` is used
  for task subprocesses, [ADR 0006](0006-subprocess-per-task.md)).
- Payloads grow with the registered modules' code size; the heavy-payload
  dedup in `map` keeps this to one copy per map call, and the temp-file
  hand-off avoids ARG_MAX limits.
