from __future__ import annotations

import functools
import json
import resource
import sys
import time

from hq.shared.util import deserialize_obj


def main() -> None:
    # arg1: task_id, arg2: payload
    task_id, payload = sys.argv[1:]
    task_id = int(task_id)

    payload = json.loads(payload)  # payload passed as: '["...", "..."]'

    # Task deserialization (payload := [task, heavy]):
    # There are two options on how tasks are serialized:
    # 1. [task, None]: task is a 0-arg callable
    # 2. [task, heavy]: if heavy exists it is the 1-arg callable, and task is its argument
    assert len(payload) == 2, f"received unrecognisable {payload=}"
    task, heavy = payload

    task = deserialize_obj(task)
    heavy = deserialize_obj(heavy)

    # the default (task is a 0-arg callable)
    if heavy is None:
        assert callable(task), f"{task=} is not callable"
        del heavy
    # here: heavy is the callable and task the arg
    else:
        assert callable(heavy), f"{heavy=} is not callable"
        task = functools.partial(heavy, task)

    # Task execution:
    # We try running the task and catch potential exceptions;
    # We also record the time it took to run it (to exclude deserialization time)
    # We return finally the taskStatus and taskInfo as JSON to the worker (parent process through stderr)
    start = time.time()
    try:
        result = task()
        info = {
            "taskStatus": "success",
            "taskInfo": {
                "runtime": time.time() - start,
                "peakRSS": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            },
        }
    except BaseException as error:
        result = error
        info = {
            "taskStatus": "error",
            "taskInfo": {
                "runtime": time.time() - start,
                "peakRSS": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                "errorType": type(error).__name__,
                "errorMessage": str(error),
            },
        }

    # log the result
    print(
        f"Task {task_id} finished with '{info['taskStatus']}' (took {info['taskInfo']['runtime']}s): {result=}"
    )

    # communicate to parent worker through stderr IPC
    # as stdout is used to print some info
    print(json.dumps(info), file=sys.stderr)
    sys.stderr.flush()


if __name__ == "__main__":
    """
    Run this script to execute a hq payload as a subprocess, e.g.,

        $ python exe.py 1 ["...", "..."]

    where:
        arg1: task ID
        arg2: json serialized payload (2-element list of taskBuf & Optional[heavyBuf])

    The idea of running the payload in a dedicated subprocess allows us to:
    - swap out the python executable (e.g. `uv run --with ... exe.py ...`)
    - source a custom env for this process (e.g. `source setup.sh && python exe.py '["foo", "bar"]' '1'`)

    This can be configured then _per-task_!

    It also allows for better debugging:
    One can execute this script manually and debug it.
    """
    main()
