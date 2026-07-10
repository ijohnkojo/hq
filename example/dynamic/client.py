import sys
import time
from functools import partial

from hq.client import HQClient
from hq.util import generate_queue_name

HOST = "http://localhost"
PORT = 3000

queue = sys.argv[1] if len(sys.argv) > 1 else generate_queue_name()
host = sys.argv[2] if len(sys.argv) > 2 else HOST
port = int(sys.argv[3]) if len(sys.argv) > 3 else PORT
verify = sys.argv[4] if len(sys.argv) > 4 else None


def make_i_larger_than_ten(i: int, retry: int) -> dict | None:
    """
    This is a recursive function that wants to make `i` larger than 10
    by doubling it.
    If `i` is still lower than 10 we submit it back into the queue with the doubled
    value and keep track of the 'recursion level'/'retry' that we're currently in
    """
    time.sleep(1)

    i *= 2
    if i < 10:
        with HQClient(host=host, port=port, queue=queue, verify=verify) as client:
            print(f"resubmitting with {i=}...")
            client.submit(partial(make_i_larger_than_ten, i, retry=retry + 1))
    else:
        return {"i": i, "retry": retry}


if __name__ == "__main__":
    print(f"queue={queue}")
    print(f"start worker: uv run example/dynamic/worker.py {queue}")

    with HQClient(host=host, port=port, queue=queue, verify=verify) as client:
        task_ids = client.map(partial(make_i_larger_than_ten, retry=0), range(1, 11))
        print(f"[map] Task IDs: {task_ids}")
