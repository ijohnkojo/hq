import time
from pathlib import Path
from functools import partial
from hq.client import HQClient

# Trust the self-signed dev cert (repo-root/cert.pem). This absolute path is
# captured by cloudpickle when the task below is serialized, so the worker that
# re-runs the task (on the same machine, in dev) resolves it too.
CA_CERT = str(Path(__file__).resolve().parents[2] / "cert.pem")


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
        with HQClient(host="https://localhost", port=3000, verify=CA_CERT) as client:
            print(f"resubmitting with {i=}...")
            client.submit(partial(make_i_larger_than_ten, i, retry=retry + 1))
    else:
        # else: return it so that the worker logs print it
        return {"i": i, "retry": retry}


if __name__ == "__main__":
    with HQClient(host="https://localhost", port=3000, verify=CA_CERT) as client:
        task_ids = client.map(partial(make_i_larger_than_ten, retry=0), range(1, 11))
        print(f"[map] Task IDs: {task_ids}")
