import os
import time
from functools import partial
from hq.client import HQClient
from dotenv import load_dotenv
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parents[1]
env = EXAMPLE_DIR / ".env"
load_dotenv(env if env.is_file() else EXAMPLE_DIR / ".env.example")

# Connection + TLS config from the environment (defaults to plain HTTP). These
# values are captured by cloudpickle when the task below is serialized, so the
# worker that re-runs the task uses the same connection settings:
#   HQ_HOST          -> server host incl. scheme (default "http://localhost")
#   HQ_PORT          -> server port (default 3000)
#   HQ_VERIFY -> path to the CA/cert that verifies the server's TLS cert
HOST = os.getenv("HQ_HOST", "http://localhost")
PORT = int(os.getenv("HQ_PORT", "3000"))
VERIFY = os.getenv("HQ_VERIFY") # it defaults to True if not set

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
        # if smaller than 10, resubmit and don't do anything
        with HQClient(host=HOST, port=PORT, verify=VERIFY) as client:
            print(f"resubmitting with {i=}...")
            client.submit(partial(make_i_larger_than_ten, i, retry=retry + 1))
    else:
        # else: return it so that the worker logs print it
        return {"i": i, "retry": retry}


if __name__ == "__main__":
    with HQClient(host=HOST, port=PORT, verify=VERIFY) as client:
        task_ids = client.map(partial(make_i_larger_than_ten, retry=0), range(1, 11))
        print(f"[map] Task IDs: {task_ids}")
